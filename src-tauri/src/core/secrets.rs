use base64::Engine;

const DPAPI_PREFIX: &str = "dpapi:";
const PLAIN_PREFIX: &str = "plain:";

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
    if stored.starts_with("enc:") {
        return None;
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
}
