<?php

namespace Database\Factories;

use App\Models\PermissionPreset;
use App\Models\PermissionPresetPermission;
use App\Support\PermissionCatalog;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PermissionPresetPermission>
 */
class PermissionPresetPermissionFactory extends Factory
{
    protected $model = PermissionPresetPermission::class;

    public function definition(): array
    {
        return [
            'permission_preset_id' => PermissionPreset::factory(),
            'permission_name' => fake()->randomElement(PermissionCatalog::all()),
        ];
    }
}
