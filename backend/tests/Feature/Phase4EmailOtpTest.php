<?php

namespace Tests\Feature;

use App\Models\OtpChallenge;
use App\Models\User;
use App\Notifications\OtpCodeNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Item 15 — email one-time-passcode sign-in (SMS deferred per OD-14). The TOTP
 * login path is untouched; this covers the additive email-OTP challenge/verify.
 */
class Phase4EmailOtpTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::factory()->create([
            'email' => 'otp.user@sky.demo',
            'password' => Hash::make('secret-pass'),
        ]);
    }

    public function test_request_otp_emails_a_code(): void
    {
        Notification::fake();
        $user = $this->user();

        $this->postJson('/api/auth/otp/request', [
            'email' => $user->email, 'password' => 'secret-pass',
        ])
            ->assertOk()
            ->assertJsonPath('data.otp_sent', true)
            ->assertJsonPath('data.channel', 'email');

        Notification::assertSentTo($user, OtpCodeNotification::class);
        $this->assertDatabaseHas('otp_challenges', [
            'user_id' => $user->id, 'channel' => 'email', 'consumed_at' => null,
        ]);
    }

    public function test_verify_otp_with_the_correct_code_signs_in(): void
    {
        Notification::fake();
        $user = $this->user();

        $this->postJson('/api/auth/otp/request', ['email' => $user->email, 'password' => 'secret-pass'])->assertOk();

        $code = null;
        Notification::assertSentTo($user, OtpCodeNotification::class, function (OtpCodeNotification $notification) use (&$code) {
            $code = $notification->code;

            return true;
        });
        $this->assertNotNull($code);

        $this->postJson('/api/auth/otp/verify', [
            'email' => $user->email, 'password' => 'secret-pass', 'code' => $code,
        ])->assertOk();

        // The challenge is consumed (single-use).
        $this->assertNotNull(OtpChallenge::query()->where('user_id', $user->id)->latest('id')->first()->consumed_at);
    }

    public function test_verify_otp_rejects_a_wrong_code(): void
    {
        Notification::fake();
        $user = $this->user();
        $this->postJson('/api/auth/otp/request', ['email' => $user->email, 'password' => 'secret-pass'])->assertOk();

        $code = null;
        Notification::assertSentTo($user, OtpCodeNotification::class, function (OtpCodeNotification $notification) use (&$code) {
            $code = $notification->code;

            return true;
        });
        $wrong = $code === '000000' ? '111111' : '000000';

        $this->postJson('/api/auth/otp/verify', [
            'email' => $user->email, 'password' => 'secret-pass', 'code' => $wrong,
        ])->assertStatus(422);
    }

    public function test_mobile_otp_verify_issues_a_token(): void
    {
        Notification::fake();
        $user = $this->user();

        $this->postJson('/api/auth/otp/mobile-request', [
            'email' => $user->email, 'password' => 'secret-pass',
        ])->assertOk()->assertJsonPath('data.otp_sent', true);

        $code = null;
        Notification::assertSentTo($user, OtpCodeNotification::class, function (OtpCodeNotification $notification) use (&$code) {
            $code = $notification->code;

            return true;
        });

        $this->postJson('/api/auth/otp/mobile-verify', [
            'email' => $user->email, 'password' => 'secret-pass', 'code' => $code, 'device_name' => 'test-device',
        ])
            ->assertOk()
            ->assertJsonPath('mfa_verified', true)
            ->assertJsonStructure(['token', 'token_type', 'device_id']);
    }

    public function test_mobile_otp_verify_rejects_a_wrong_code(): void
    {
        Notification::fake();
        $user = $this->user();
        $this->postJson('/api/auth/otp/mobile-request', ['email' => $user->email, 'password' => 'secret-pass'])->assertOk();

        $code = null;
        Notification::assertSentTo($user, OtpCodeNotification::class, function (OtpCodeNotification $notification) use (&$code) {
            $code = $notification->code;

            return true;
        });
        $wrong = $code === '000000' ? '111111' : '000000';

        $this->postJson('/api/auth/otp/mobile-verify', [
            'email' => $user->email, 'password' => 'secret-pass', 'code' => $wrong, 'device_name' => 'test-device',
        ])->assertStatus(422);
    }

    public function test_otp_endpoints_reject_bad_credentials(): void
    {
        $user = $this->user();

        $this->postJson('/api/auth/otp/request', [
            'email' => $user->email, 'password' => 'wrong-pass',
        ])->assertStatus(422);

        $this->postJson('/api/auth/otp/verify', [
            'email' => $user->email, 'password' => 'wrong-pass', 'code' => '123456',
        ])->assertStatus(422);
    }
}
