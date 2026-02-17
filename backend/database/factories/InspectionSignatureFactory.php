<?php

namespace Database\Factories;

use App\Models\InspectionSubmission;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\InspectionSignature>
 */
class InspectionSignatureFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'inspection_submission_id' => InspectionSubmission::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'inspection_approval_id' => null,
            'signed_by' => User::factory(),
            'context' => fake()->randomElement(['approval_step', 'owner_signoff', 'closure']),
            'file_name' => Str::uuid().'.png',
            'file_path' => 'seed/signatures/'.Str::uuid().'.png',
            'mime_type' => 'image/png',
            'file_size' => fake()->numberBetween(500, 5000),
            'signed_at' => Carbon::now()->subDays(fake()->numberBetween(0, 10)),
            'metadata' => ['seeded' => true],
        ];
    }
}
