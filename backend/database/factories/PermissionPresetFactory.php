<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\PermissionPreset;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PermissionPreset>
 */
class PermissionPresetFactory extends Factory
{
    protected $model = PermissionPreset::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'preset_key' => fake()->unique()->slug(2),
            'name' => fake()->words(2, true),
            'description' => fake()->optional()->sentence(),
            'is_system' => false,
        ];
    }
}
