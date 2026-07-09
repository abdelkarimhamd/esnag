<?php

return [

    /*
    |--------------------------------------------------------------------------
    | API request logging
    |--------------------------------------------------------------------------
    |
    | These values back the AttachRequestContext / LogSlowApiRequests
    | middleware. They are read through config() (not env() at runtime) so
    | they keep working after `php artisan config:cache`, where the .env file
    | is no longer loaded and env() outside of config files returns null.
    |
    */

    'request_log_enabled' => env('API_REQUEST_LOG_ENABLED', true),

    'request_log_include_success' => env('API_REQUEST_LOG_INCLUDE_SUCCESS', false),

    'slow_request_threshold_ms' => (int) env('API_SLOW_REQUEST_THRESHOLD_MS', 800),

];
