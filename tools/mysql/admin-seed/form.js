(() => {
  'use strict';
  const form = document.querySelector('#seed-form');
  const email = document.querySelector('#email');
  const password = document.querySelector('#password');
  const confirm = document.querySelector('#confirm');
  const button = document.querySelector('#generate');
  const status = document.querySelector('#status');
  const encoder = new TextEncoder();
  function hex(value) {
    return Array.from(encoder.encode(value), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function uuid() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const s = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
  }
  function makeSQL(address, hash) {
    if (!/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(hash)) throw new Error('Password hash তৈরি হয়নি। আবার চেষ্টা করুন।');
    const id = uuid();
    return `-- PRIVATE: do not publish this file or send it in chat.
-- Initial Admin only. No established Admin password is overwritten.
USE \`if0_43242550_ekwl_stage\`;
SET NAMES utf8mb4;
START TRANSACTION;
UPDATE ekwl_locks SET name=name WHERE name='users';
SET @ekwl_bootstrap_email=CONVERT(0x${hex(address)} USING utf8mb4);
SET @ekwl_bootstrap_hash='${hash}';
SET @ekwl_bootstrap_uuid='${id}';
SET @ekwl_bootstrap_allowed=NOT EXISTS (
 SELECT 1 FROM ekwl_users u JOIN ekwl_site_users s ON s.auth_user_id=u.id
 WHERE LOWER(s.role)='admin' AND LOWER(s.status)='active' AND u.password_hash IS NOT NULL
);
INSERT INTO ekwl_site_users(auth_user_id,email,role,status,permissions,created_at,updated_at)
 SELECT @ekwl_bootstrap_uuid,@ekwl_bootstrap_email,'admin','active','{}',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)
 WHERE @ekwl_bootstrap_allowed
 AND NOT EXISTS(SELECT 1 FROM ekwl_site_users WHERE LOWER(email)=@ekwl_bootstrap_email)
 AND NOT EXISTS(SELECT 1 FROM ekwl_site_users WHERE LOWER(role)='admin' AND LOWER(status)='active');
SET @ekwl_bootstrap_owner=(
 SELECT auth_user_id FROM ekwl_site_users
 WHERE LOWER(email)=@ekwl_bootstrap_email AND LOWER(role)='admin' AND LOWER(status)='active' LIMIT 1
);
INSERT INTO ekwl_users(id,password_hash,auth_version,created_at)
 SELECT @ekwl_bootstrap_owner,@ekwl_bootstrap_hash,1,UTC_TIMESTAMP(6)
 WHERE @ekwl_bootstrap_allowed AND @ekwl_bootstrap_owner IS NOT NULL
 ON DUPLICATE KEY UPDATE password_hash=IFNULL(password_hash,VALUES(password_hash)),auth_version=auth_version+1;
INSERT INTO ekwl_audit_log(actor_id,action,target,metadata,created_at)
 SELECT @ekwl_bootstrap_owner,'auth.bootstrap',@ekwl_bootstrap_owner,
 '{"method":"offline-phpmyadmin","scope":"initial-staging-admin"}',UTC_TIMESTAMP(6)
 WHERE @ekwl_bootstrap_allowed AND @ekwl_bootstrap_owner IS NOT NULL;
COMMIT;
SELECT COUNT(*) AS ready_admin_accounts
 FROM ekwl_site_users s JOIN ekwl_users u ON u.id=s.auth_user_id
 WHERE LOWER(s.role)='admin' AND LOWER(s.status)='active' AND u.password_hash IS NOT NULL;
SET @ekwl_bootstrap_hash=NULL,@ekwl_bootstrap_email=NULL,@ekwl_bootstrap_uuid=NULL,@ekwl_bootstrap_owner=NULL,@ekwl_bootstrap_allowed=NULL;
`;
  }
  const localFile = location.protocol === 'file:';
  const localPreview = ['127.0.0.1', 'localhost'].includes(location.hostname) && window.isSecureContext;
  if (!localFile && !localPreview) {
    form.querySelectorAll('input').forEach(input => { input.disabled = true; });
    button.disabled = true;
    status.textContent = 'এই HTML ফাইলটি আগে কম্পিউটারে Save করুন। তারপর ফাইলটিতে double-click করে খুলুন।';
    return;
  }
  if (!crypto?.getRandomValues || !window.bcrypt) {
    button.disabled = true;
    status.textContent = 'সাম্প্রতিক Chrome বা Firefox দিয়ে এই local ফাইলটি খুলুন।';
    return;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const address = email.value.trim().toLowerCase();
    let secret = password.value;
    const size = encoder.encode(secret).length;
    if (size < 12 || size > 72 || secret.includes('\0')) {
      status.textContent = 'Password কমপক্ষে ১২ byte হতে হবে। English অক্ষর/সংখ্যায় ১২–৭২ অক্ষর ব্যবহার করতে পারেন।';
      return;
    }
    if (secret !== confirm.value) {
      status.textContent = 'দুই ঘরের password মিলছে না।';
      return;
    }
    button.disabled = true;
    status.textContent = 'আপনার কম্পিউটারে password hash তৈরি হচ্ছে…';
    try {
      const hash = await bcrypt.hash(secret, 12);
      const sql = makeSQL(address, hash);
      const url = URL.createObjectURL(new Blob([sql], {type:'application/sql;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ekwl-staging-admin-private-v2.sql';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      password.value = confirm.value = '';
      secret = '';
      status.textContent = 'SQL ফাইল ডাউনলোড হয়েছে। phpMyAdmin-এর নতুন staging database-এ Import করলে account তৈরি হবে। Password-টি মনে রাখুন। SQL ফাইল chat-এ পাঠাবেন না।';
    } catch (_) {
      status.textContent = 'SQL তৈরি হয়নি। Password আবার দিয়ে চেষ্টা করুন।';
    } finally {
      secret = '';
      button.disabled = false;
    }
  });
})();
