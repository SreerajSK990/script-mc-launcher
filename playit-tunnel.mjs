import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const API_BASE = "https://api.playit.gg";
const CONFIG_DIR = path.join(os.homedir(), ".script-launcher", "playit");
const SESSION_FILE = path.join(CONFIG_DIR, "session.json");
const AGENT_FILE = path.join(CONFIG_DIR, "agent.json");

async function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

async function loadJson(file) {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveJson(file, data) {
  await ensureConfigDir();
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function callApi(pathName, body = {}, authHeader = null) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  const response = await fetch(`${API_BASE}${pathName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json) {
    throw new Error(`API ${pathName} failed with HTTP ${response.status}: ${JSON.stringify(json)}`);
  }

  if (json.status === "success") {
    return json.data;
  }

  throw new Error(`API ${pathName} error: ${JSON.stringify(json.data)}`);
}

function openBrowser(url) {
  const currentPlatform = os.platform();
  try {
    if (currentPlatform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
    } else if (currentPlatform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true });
    } else {
      spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    }
  } catch {
    console.log(`Please open the link manually in your browser: ${url}`);
  }
}

function getBinaryDownloadUrl() {
  const currentPlatform = os.platform();
  const currentArch = os.arch();
  const baseUrl = "https://github.com/playit-cloud/playit-agent/releases/latest/download";

  if (currentPlatform === "win32") {
    if (currentArch === "x64") return `${baseUrl}/playit-windows-x86_64.exe`;
    if (currentArch === "ia32") return `${baseUrl}/playit-windows-x86.exe`;
  }
  if (currentPlatform === "linux") {
    if (currentArch === "x64") return `${baseUrl}/playit-linux-amd64`;
    if (currentArch === "arm64") return `${baseUrl}/playit-linux-aarch64`;
    if (currentArch === "arm") return `${baseUrl}/playit-linux-armv7`;
  }
  return null;
}

async function resolvePlayitBinary() {
  if (process.env.PLAYIT_BIN && existsSync(process.env.PLAYIT_BIN)) {
    return process.env.PLAYIT_BIN;
  }

  const binaryName = os.platform() === "win32" ? "playit.exe" : "playit";
  const localBinDir = path.join(CONFIG_DIR, "bin");
  const localBinPath = path.join(localBinDir, binaryName);

  if (existsSync(localBinPath)) {
    return localBinPath;
  }

  const downloadUrl = getBinaryDownloadUrl();
  if (!downloadUrl) {
    return "playit";
  }

  console.log(`Downloading official playit binary from ${downloadUrl}...`);
  await mkdir(localBinDir, { recursive: true });

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Failed to download playit binary: HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  await writeFile(localBinPath, Buffer.from(arrayBuffer));

  if (os.platform() !== "win32") {
    await chmod(localBinPath, 0o755);
  }

  console.log(`Playit binary ready at ${localBinPath}`);
  return localBinPath;
}

async function claimAgentViaBrowser() {
  const code = Math.random().toString(36).substring(2, 10);
  const claimUrl = `https://playit.gg/claim/${code}`;

  const setupResponse = await callApi("/claim/setup", {
    code,
    agent_type: "self-managed",
    version: "1.1.0",
  });

  console.log("\n=======================================================");
  console.log("             PLAYIT.GG AGENT AUTHORIZATION             ");
  console.log("=======================================================");
  console.log(`Please visit this URL in your browser to approve this agent:`);
  console.log(`\n  👉  ${claimUrl}\n`);
  console.log("=======================================================\n");

  openBrowser(claimUrl);
  console.log("Attempted to launch browser automatically.");
  console.log("Waiting for confirmation on playit.gg...");

  let state = setupResponse;
  while (state !== "UserAccepted") {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      state = await callApi("/claim/setup", {
        code,
        agent_type: "self-managed",
        version: "1.1.0",
      });

      if (state === "WaitingForUser") {
        process.stdout.write("\rLink opened! Waiting for you to click 'Add Agent' in browser...   ");
      } else if (state === "WaitingForUserVisit") {
        process.stdout.write("\rWaiting for you to open the claim link in your browser...         ");
      } else if (state === "UserRejected") {
        throw new Error("Agent authorization was rejected by user on playit.gg.");
      }
    } catch (err) {
      if (err.message.includes("UserRejected")) {
        throw err;
      }
    }
  }

  console.log("\n\nAuthorization confirmed! Exchanging claim code for agent secret key...");
  const exchange = await callApi("/claim/exchange", { code });
  return exchange.secret_key;
}

async function loginExistingAccount(rl) {
  const email = (await rl.question("Playit.gg Email: ")).trim();
  const password = (await rl.question("Playit.gg Password: ")).trim();

  console.log("Authenticating with playit.gg...");
  const loginRes = await callApi("/login/signin", { email, password });

  if (loginRes.auth?.totp_status?.status === "required") {
    console.log("Two-factor authentication required for this account.");
  }

  await saveJson(SESSION_FILE, loginRes);
  console.log("Logged in successfully!");

  console.log("Generating agent claim for your account...");
  return await claimAgentViaBrowser();
}

async function resolveSecretKey(rl) {
  const cachedAgent = await loadJson(AGENT_FILE);
  if (cachedAgent?.secret_key) {
    console.log(`Found cached agent (ID: ${cachedAgent.agent_id || "saved"}).`);
    const reuse = (await rl.question("Use this existing agent? [Y/n]: ")).trim().toLowerCase();
    if (!reuse || reuse === "y" || reuse === "yes") {
      return cachedAgent.secret_key;
    }
  }

  console.log("\nSelect Playit.gg connection method:");
  console.log("  1) Quick Claim (No password required, click link in browser)");
  console.log("  2) Login with existing Playit.gg account (Email + Password)");
  const choice = (await rl.question("Choose [1/2, default 1]: ")).trim();

  let secretKey = null;
  if (choice === "2") {
    secretKey = await loginExistingAccount(rl);
  } else {
    secretKey = await claimAgentViaBrowser();
  }

  await saveJson(AGENT_FILE, { secret_key: secretKey });
  return secretKey;
}

function startPlayitDaemon(binPath, secretKey) {
  console.log("\nStarting playit background daemon...");
  const child = spawn(binPath, ["--secret", secretKey], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const readyPromise = new Promise((resolve) => {
    let resolved = false;

    const handleOutput = (text) => {
      if (text.includes("playit connected") || text.includes("tunnels loaded")) {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }
      if (text.includes("tunnel running") || text.includes("registered") || text.includes("connected")) {
        process.stdout.write(`[playit] ${text}`);
      }
    };

    child.stdout.on("data", (chunk) => handleOutput(chunk.toString()));
    child.stderr.on("data", (chunk) => handleOutput(chunk.toString()));

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    }, 4000);
  });

  child.on("exit", (code) => {
    console.log(`\nPlayit daemon stopped (exit code ${code}).`);
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    console.log("\nShutting down tunnel...");
    child.kill("SIGTERM");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    child.kill("SIGTERM");
    process.exit(0);
  });

  return { child, readyPromise };
}

async function getOrCreateTunnel(secretKey, localPort) {
  const agentKeyHeader = `Agent-Key ${secretKey}`;
  console.log("Checking agent tunnels on playit.gg...");
  const listData = await callApi("/v1/tunnels/list", {}, agentKeyHeader);
  const runData = await callApi("/v1/agents/rundata", {}, agentKeyHeader);
  const agentId = runData.agent_id;

  await saveJson(AGENT_FILE, { secret_key: secretKey, agent_id: agentId });

  const existingTunnels = listData.tunnels || [];
  const matchingTunnel = existingTunnels.find((t) => t.tunnel_type === "minecraft-java" && t.user_enabled);

  if (matchingTunnel) {
    const currentLocalPort = matchingTunnel.origin?.details?.config_data?.fields?.find(
      (f) => f.name === "local_port"
    )?.value;

    if (String(currentLocalPort) !== String(localPort)) {
      console.log(`Updating existing tunnel port: ${currentLocalPort} -> ${localPort}...`);
      await callApi(
        "/tunnels/update",
        {
          tunnel_id: matchingTunnel.id,
          local_ip: "127.0.0.1",
          local_port: localPort,
          agent_id: agentId,
          enabled: true,
        },
        agentKeyHeader
      );
    } else {
      console.log(`Existing tunnel already mapped to 127.0.0.1:${localPort}.`);
    }

    return extractAddresses(matchingTunnel);
  }

  console.log(`Registering new tunnel pointing to 127.0.0.1:${localPort}...`);
  const createRes = await callApi(
    "/tunnels/create",
    {
      name: `Minecraft Server (${localPort})`,
      tunnel_type: "minecraft-java",
      port_type: "tcp",
      port_count: 1,
      origin: {
        type: "agent",
        data: {
          agent_id: agentId,
          local_ip: "127.0.0.1",
          local_port: localPort,
        },
      },
      enabled: true,
      alloc: null,
      firewall_id: null,
      proxy_protocol: null,
    },
    agentKeyHeader
  );

  console.log("Waiting for public domain allocation...");
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const currentList = await callApi("/v1/tunnels/list", {}, agentKeyHeader);
    const match = currentList.tunnels?.find((t) => t.id === createRes.id);
    if (match && match.connect_addresses && match.connect_addresses.length > 0) {
      return extractAddresses(match);
    }
  }

  throw new Error("Timed out waiting for playit.gg to assign a public address.");
}

function extractAddresses(tunnel) {
  const addresses = tunnel.connect_addresses || [];
  const domainEntry = addresses.find((a) => a.type === "auto" && !a.value.address.includes(":"));
  const directEntry = addresses.find((a) => a.value.address.includes(":"));

  return {
    domain: domainEntry ? domainEntry.value.address : tunnel.display_address,
    direct: directEntry ? directEntry.value.address : null,
  };
}

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log("=======================================================");
  console.log("        PLAYIT.GG AUTOMATIC TUNNEL CONTROLLER          ");
  console.log("=======================================================");
  console.log("");

  const portStr = await rl.question("Enter local server port [default: 25565]: ");
  const localPort = Number.parseInt(portStr.trim(), 10) || 25565;

  const secretKey = await resolveSecretKey(rl);
  rl.close();

  const binaryPath = await resolvePlayitBinary();
  const { readyPromise } = startPlayitDaemon(binaryPath, secretKey);

  console.log("Connecting to playit.gg network...");
  await readyPromise;

  const { domain, direct } = await getOrCreateTunnel(secretKey, localPort);

  console.log("\n=======================================================");
  console.log("               TUNNEL ESTABLISHED!                     ");
  console.log("=======================================================");
  console.log(" Share this address with your friends to connect:");
  if (domain) {
    console.log(`\n   🎮  Primary Domain:  ${domain}`);
  }
  if (direct) {
    console.log(`   🔌  Direct IP:Port:  ${direct}`);
  }
  console.log(`\n Pointed locally to:   127.0.0.1:${localPort}`);
  console.log("=======================================================");
  console.log("Tunnel is active! Press Ctrl+C at any time to close.\n");
}

main().catch((err) => {
  console.error("\nTunnel setup failed:", err.message);
  process.exit(1);
});
