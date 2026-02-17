<?php

return [
    'mfa_issuer' => env('SECURITY_MFA_ISSUER', env('APP_NAME', 'eSnagging')),
    'default_mobile_trust_days' => (int) env('SECURITY_DEFAULT_MOBILE_TRUST_DAYS', 30),
    'antivirus_driver' => env('SECURITY_ANTIVIRUS_DRIVER', 'eicar'),
    'clamav_binary' => env('SECURITY_CLAMAV_BINARY', 'clamscan'),
];

