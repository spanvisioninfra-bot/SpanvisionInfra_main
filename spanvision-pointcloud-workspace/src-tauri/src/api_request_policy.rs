/// The local automation bridge accepts native clients, never scripts from web pages.
/// Host validation also prevents DNS rebinding to its loopback listener.
pub fn allows_request(host: Option<&str>, origin: Option<&str>, port: u16) -> bool {
    origin.is_none() && host.is_some_and(|host| {
        host == format!("127.0.0.1:{}", port) || host == format!("localhost:{}", port)
    })
}

pub fn read_script_body(reader: impl std::io::Read) -> Result<String, (u16, &'static str)> {
    use std::io::Read;
    const MAX_BYTES: u64 = 1_048_576;
    let mut body = Vec::new();
    reader.take(MAX_BYTES + 1).read_to_end(&mut body).map_err(|_| (400, "Could not read the automation request"))?;
    if body.len() as u64 > MAX_BYTES { return Err((413, "Automation scripts must be no larger than 1 MB")); }
    String::from_utf8(body).map_err(|_| (400, "Automation scripts must use UTF-8"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_loopback_clients_are_allowed() {
        assert!(allows_request(Some("127.0.0.1:49100"), None, 49100));
        assert!(allows_request(Some("localhost:49100"), None, 49100));
    }
    #[test]
    fn browser_origins_and_rebinding_hosts_are_rejected() {
        for origin in ["https://example.com", "null", "http://localhost:3000"] {
            assert!(!allows_request(Some("127.0.0.1:49100"), Some(origin), 49100));
        }
        for host in ["example.com:49100", "127.0.0.1:49101", "localhost:49100.example.com"] {
            assert!(!allows_request(Some(host), None, 49100));
        }
        assert!(!allows_request(None, None, 49100));
    }
    #[test]
    fn body_limit_counts_streamed_bytes_and_validates_encoding() {
        let script=b"return 'a\\b';";
        assert_eq!(read_script_body(&script[..]).unwrap(),"return 'a\\b';");
        assert_eq!(read_script_body(&vec![b'x';1_048_577][..]).unwrap_err().0,413);
        assert_eq!(read_script_body(&[255u8][..]).unwrap_err().0,400);
    }
}
