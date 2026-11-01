use base64::Engine;

const DPAPI_PREFIX: &str = "dpapi:";
const PLAIN_PREFIX: &str = "plain:";
const ELECTRON_PREFIX: &str = "enc:";
const CHROMIUM_VALUE_VERSION: &[u8] = b"v10";
const CHROMIUM_NONCE_LENGTH: usize = 12;
const CHROMIUM_KEY_PREFIX: &[u8] = b"DPAPI";
const ELECTRON_USER_DATA_FOLDERS: [&str; 2] = ["Script Minecraft Launcher", "script-mc-launcher"];

pub fn open_chromium_value(key: &[u8], sealed: &[u8]) -> Option<String> {
    use aes_gcm::aead::Aead;
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    let payload = sealed.strip_prefix(CHROMIUM_VALUE_VERSION)?;
    if payload.len() <= CHROMIUM_NONCE_LENGTH {
        return None;
    }
    let (nonce, ciphertext) = payload.split_at(CHROMIUM_NONCE_LENGTH);
    let cipher = Aes256Gcm::new_from_slice(key).ok()?;
    let plain = cipher.decrypt(Nonce::from_slice(nonce), ciphertext).ok()?;
    String::from_utf8(plain).ok()
}

fn electron_master_keys() -> &'static Vec<Vec<u8>> {
    static KEYS: std::sync::OnceLock<Vec<Vec<u8>>> = std::sync::OnceLock::new();
    KEYS.get_or_init(load_electron_master_keys)
}

#[cfg(windows)]
fn load_electron_master_keys() -> Vec<Vec<u8>> {
    let Ok(app_data) = std::env::var("APPDATA") else {
        return Vec::new();
    };
    ELECTRON_USER_DATA_FOLDERS
        .iter()
        .filter_map(|folder| {
            let local_state = std::fs::read_to_string(std::path::Path::new(&app_data).join(folder).join("Local State")).ok()?;
            let parsed: serde_json::Value = serde_json::from_str(&local_state).ok()?;
            let encoded_key = parsed.get("os_crypt")?.get("encrypted_key")?.as_str()?;
            let wrapped = base64::engine::general_purpose::STANDARD.decode(encoded_key).ok()?;
            platform::unprotect(wrapped.strip_prefix(CHROMIUM_KEY_PREFIX)?).ok()
        })
        .collect()
}

#[cfg(not(windows))]
fn load_electron_master_keys() -> Vec<Vec<u8>> {
    let _ = (ELECTRON_USER_DATA_FOLDERS, CHROMIUM_KEY_PREFIX);
    Vec::new()
}

#[cfg(windows)]
mod platform {
    use std::ptr;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    fn take_output(blob: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        if blob.pbData.is_null() {
            return Vec::new();
        }
        let bytes = unsafe { std::slice::from_raw_parts(blob.pbData, blob.cbData as usize) }.to_vec();
        unsafe {
            LocalFree(blob.pbData.cast());
        }
        bytes
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };
        let succeeded = unsafe {
            CryptProtectData(
                &input,
                ptr::null(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if succeeded == 0 {
            return Err("Windows refused to encrypt the credential".to_string());
        }
        Ok(take_output(output))
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };
        let succeeded = unsafe {
            CryptUnprotectData(
                &input,
                ptr::null_mut(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if succeeded == 0 {
            return Err("Windows could not decrypt the credential for this user".to_string());
        }
        Ok(take_output(output))
    }
}

pub fn seal(plaintext: &str) -> String {
    #[cfg(windows)]
    {
        if let Ok(sealed) = platform::protect(plaintext.as_bytes()) {
            return format!("{DPAPI_PREFIX}{}", base64::engine::general_purpose::STANDARD.encode(sealed));
        }
    }
    format!(
        "{PLAIN_PREFIX}{}",
        base64::engine::general_purpose::STANDARD.encode(plaintext.as_bytes())
    )
}

pub fn open(stored: &str) -> Option<String> {
    if let Some(encoded) = stored.strip_prefix(DPAPI_PREFIX) {
        #[cfg(windows)]
        {
            let sealed = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
            let plain = platform::unprotect(&sealed).ok()?;
            return String::from_utf8(plain).ok();
        }
        #[cfg(not(windows))]
        {
            let _ = encoded;
            return None;
        }
    }
    if let Some(encoded) = stored.strip_prefix(PLAIN_PREFIX) {
        let decoded = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
        return String::from_utf8(decoded).ok();
    }
    if let Some(encoded) = stored.strip_prefix(ELECTRON_PREFIX) {
        let sealed = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
        return electron_master_keys()
            .iter()
            .find_map(|key| open_chromium_value(key, &sealed));
    }
    Some(stored.to_string())
}

pub fn is_sealed_with_current_scheme(stored: &str) -> bool {
    if cfg!(windows) {
        stored.starts_with(DPAPI_PREFIX)
    } else {
        stored.starts_with(PLAIN_PREFIX)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sealed_secrets_round_trip() {
        let sealed = seal("token-value-123");
        assert!(is_sealed_with_current_scheme(&sealed));
        assert!(!sealed.contains("token-value-123"));
        assert_eq!(open(&sealed).as_deref(), Some("token-value-123"));
    }

    #[test]
    fn legacy_formats_are_readable() {
        assert_eq!(open("plain:aGVsbG8=").as_deref(), Some("hello"));
        assert_eq!(open("raw-token").as_deref(), Some("raw-token"));
        assert_eq!(open("enc:AAAA"), None);
    }

    #[test]
    #[ignore]
    fn opens_live_electron_value() {
        let stored = std::env::var("ELECTRON_SEALED_VALUE").unwrap();
        assert_eq!(open(&stored).as_deref(), Some("migration-check-token"));
    }

    #[test]
    fn chromium_values_decrypt_with_matching_key() {
        use aes_gcm::aead::Aead;
        use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
        let key = [7u8; 32];
        let nonce = [3u8; 12];
        let ciphertext = Aes256Gcm::new_from_slice(&key)
            .unwrap()
            .encrypt(Nonce::from_slice(&nonce), b"electron-token".as_ref())
            .unwrap();
        let mut sealed = b"v10".to_vec();
        sealed.extend_from_slice(&nonce);
        sealed.extend_from_slice(&ciphertext);
        assert_eq!(open_chromium_value(&key, &sealed).as_deref(), Some("electron-token"));
        assert_eq!(open_chromium_value(&[8u8; 32], &sealed), None);
        assert_eq!(open_chromium_value(&key, b"v11short"), None);
    }
}
