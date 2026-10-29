"""Read-only FTPS TLS preflight. No login, passwords, file reads or uploads."""
import ftplib
import os
import re
import ssl
import subprocess
import sys


def check(host):
    if not host or not re.fullmatch(r'[A-Za-z0-9.-]+', host):
        raise ValueError('FTP_HOST must contain only the configured FTP hostname.')
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    try:
        with ftplib.FTP_TLS(context=context, timeout=20) as ftp:
            ftp.connect(host, 21)
            ftp.auth()  # AUTH TLS only: never sends USER/PASS.
            print('Python/OpenSSL FTPS certificate verification: PASSED (' + ftp.sock.version() + ')', flush=True)
        return True
    except ssl.SSLCertVerificationError as error:
        print('Python/OpenSSL FTPS certificate verification: FAILED; code=' + str(error.verify_code)
              + '; reason=' + error.verify_message.replace(host, '[configured host]'), flush=True)
    except (OSError, ftplib.Error) as error:
        print('FTPS preflight connection failed: ' + type(error).__name__, flush=True)
        return False
    # Read the public certificate chain during a second verified handshake. No login
    # follows a failed verification. Only dates and fingerprints are printed, no host.
    result = subprocess.run(['openssl', 's_client', '-starttls', 'ftp', '-connect', host + ':21',
                             '-servername', host, '-verify_hostname', host, '-verify_return_error',
                             '-showcerts'], input='', text=True, capture_output=True, timeout=25)
    certificates = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', result.stdout, re.S)
    for index, certificate in enumerate(certificates):
        details = subprocess.run(['openssl', 'x509', '-noout', '-dates', '-fingerprint', '-sha256'],
                                 input=certificate, text=True, capture_output=True, check=True).stdout.strip()
        print('Public certificate ' + str(index) + ' (0 = server leaf):\n' + details, flush=True)
    for line in result.stderr.splitlines():
        if re.search(r'^depth=\d+$|^verify error:num=', line):
            print('OpenSSL chain diagnostic: ' + line.replace(host, '[configured host]'), flush=True)
    return False


if __name__ == '__main__':
    try:
        valid = check(os.environ.get('FTP_HOST', ''))
    except (ValueError, subprocess.SubprocessError) as error:
        print('FTPS preflight unavailable: ' + type(error).__name__, flush=True)
        valid = False
    sys.exit(0 if valid else 1)
