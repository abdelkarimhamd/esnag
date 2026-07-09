<?php

return [
    /*
    |--------------------------------------------------------------------------
    | SMS gateway (OD-14)
    |--------------------------------------------------------------------------
    | env() is only read here in config (the no-runtime-env rule applies to
    | app/ code, which must resolve these via config()). SMS is only attempted
    | when 'enabled' is true and a gateway driver is provisioned; email remains
    | the guaranteed fallback until OD-14 confirms the gateway.
    */
    'enabled' => env('SMS_ENABLED', false),

    'driver' => env('SMS_DRIVER', 'log'),

    'from' => env('SMS_FROM'),

    'drivers' => [
        'log' => [],
        'twilio' => [
            'sid' => env('TWILIO_SID'),
            'token' => env('TWILIO_TOKEN'),
            'from' => env('TWILIO_FROM'),
        ],
    ],
];
