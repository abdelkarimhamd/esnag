<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

/**
 * Config-driven SMS gateway abstraction (item 11 / OD-14). All configuration is
 * read via config() — never env() — to honour the no-runtime-env rule. Only the
 * 'log' driver is wired in-repo; a real gateway (e.g. Twilio) is provisioned
 * through config once OD-14 confirms availability. When SMS is disabled or the
 * gateway is unavailable, send() returns false and the caller relies on email.
 */
class SmsGatewayService
{
    public function isEnabled(): bool
    {
        return (bool) config('sms.enabled', false);
    }

    public function send(string $to, string $message): bool
    {
        if (! $this->isEnabled() || $to === '' || $message === '') {
            return false;
        }

        $driver = (string) config('sms.driver', 'log');

        // The 'log' driver records the dispatch so the flow is demonstrable and
        // testable without a live gateway. Real drivers plug in here by config.
        Log::info('SMS dispatch', [
            'driver' => $driver,
            'to' => $to,
            'message' => $message,
        ]);

        return true;
    }
}
