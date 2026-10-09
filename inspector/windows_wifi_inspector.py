#!/usr/bin/env python3
"""WiFiShield AI V1.1: read-only Windows Wi-Fi assessment.
Run locally on a Windows PC using Python 3.10+. No admin access or network probing.
No passwords, IP addresses, MAC addresses or SSIDs are included in exported reports.
"""
import json, platform, re, subprocess, sys
from datetime import datetime, timezone

def command(*args):
    try:
        return subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=12, check=False).stdout
    except (OSError, subprocess.TimeoutExpired):
        return ""

def field(text, name):
    match = re.search(r"^\s*" + re.escape(name) + r"\s*:\s*(.*?)\s*$", text, re.I | re.M)
    return match.group(1) if match else None

def inspect():
    if platform.system() != "Windows":
        raise RuntimeError("The inspector currently supports Windows only.")
    wifi = command("netsh", "wlan", "show", "interfaces")
    profiles = command("netsh", "wlan", "show", "profiles")
    if not wifi.strip():
        raise RuntimeError("Windows Wi-Fi information unavailable. No scan was performed.")
    state = field(wifi, "State")
    auth = field(wifi, "Authentication")
    cipher = field(wifi, "Cipher")
    findings = []
    if not state or state.lower() != "connected":
        findings.append({"level":"info","finding":"No connected Wi-Fi adapter was detected.",
                         "action":"Connect to Wi-Fi before assessing its link security."})
    elif not auth:
        findings.append({"level":"unknown","finding":"Wi-Fi authentication type could not be determined.",
                         "action":"Check your adapter's Wi-Fi security properties manually."})
    elif "open" in auth.lower():
        findings.append({"level":"caution","finding":"This connection reports open Wi-Fi authentication.",
                         "action":"Verify the hotspot with staff. Prefer cellular data for sensitive tasks."})
    elif "wep" in auth.lower() or "wpa-personal" in auth.lower() or auth.lower().strip()=="wpa":
        findings.append({"level":"caution","finding":"An older Wi-Fi authentication standard was reported.",
                         "action":"Use WPA2-AES or WPA3 on networks you manage."})
    elif "wpa3" in auth.lower():
        findings.append({"level":"info","finding":"WPA3 authentication is reported.",
                         "action":"Continue to verify network identity and avoid phishing."})
    elif "wpa2" in auth.lower():
        findings.append({"level":"info","finding":"WPA2 authentication is reported.",
                         "action":"Continue to verify network identity and avoid phishing."})
    else:
        findings.append({"level":"unknown","finding":"The reported authentication type is unrecognized.",
                         "action":"Review the connection settings manually."})
    if cipher and ("tkip" in cipher.lower() or "wep" in cipher.lower()):
        findings.append({"level":"caution","finding":"Legacy wireless encryption was reported.",
                         "action":"Prefer AES/CCMP where supported."})
    return {
        "product":"WiFiShield AI V1.1", "checked_at":datetime.now(timezone.utc).isoformat(),
        "device":"Windows", "connected": bool(state and state.lower()=="connected"),
        "authentication":auth or "unknown", "cipher":cipher or "unknown",
        "saved_profile_count":len(re.findall(r"^\s*All User Profile\s*:",profiles,re.M)),
        "findings":findings,
        "limitations":"Read-only OS-reported settings, not a penetration test or proof the hotspot is genuine. No packet interception, password capture, router probing, or malware detection.",
        "privacy":"No report is uploaded by this program. Do not share reports containing information you consider sensitive."
    }

if __name__ == "__main__":
    print("WiFiShield AI V1.1 | Local Windows Wi-Fi inspector")
    print("Reads OS-reported Wi-Fi settings only. No packets sent. No data uploaded.")
    if input("Run read-only assessment? [y/N] ").strip().lower() != "y":
        print("Cancelled."); sys.exit(0)
    try:
        print(json.dumps(inspect(), indent=2))
    except RuntimeError as exc:
        print("Unable to assess:",exc,file=sys.stderr);sys.exit(1)
