"""Check that the hosting diagnostic never logs in or weakens certificate verification."""
import importlib.util
import ssl
from pathlib import Path
from unittest.mock import MagicMock, patch
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('preflight', ROOT/'tools/mysql/check_ftps_tls.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
ftp=MagicMock();ftp.__enter__.return_value=ftp;ftp.sock.version.return_value='TLSv1.3'
with patch.object(module.ftplib,'FTP_TLS',return_value=ftp) as factory:
    assert module.check('example.invalid')
    context=factory.call_args.kwargs['context']
    assert context.verify_mode==ssl.CERT_REQUIRED and context.check_hostname
    assert context.minimum_version>=ssl.TLSVersion.TLSv1_2
    ftp.auth.assert_called_once();ftp.login.assert_not_called();ftp.storbinary.assert_not_called()
try:module.check('bad host/21')
except ValueError:pass
else:raise AssertionError('Invalid host accepted')
print('PASS verified TLS preflight uses AUTH TLS only; no credentials or upload; configured host validation')
