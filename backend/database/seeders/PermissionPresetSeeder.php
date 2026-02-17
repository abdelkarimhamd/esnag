<?php

namespace Database\Seeders;

use App\Models\PermissionPreset;
use App\Support\PermissionPresetCatalog;
use Illuminate\Database\Seeder;

class PermissionPresetSeeder extends Seeder
{
    public function run(): void
    {
        foreach (PermissionPresetCatalog::all() as $presetKey => $definition) {
            $preset = PermissionPreset::query()->updateOrCreate(
                [
                    'organization_id' => null,
                    'preset_key' => $presetKey,
                ],
                [
                    'name' => $definition['name'],
                    'description' => $definition['description'],
                    'is_system' => true,
                ]
            );

            $preset->permissions()->delete();

            foreach ($definition['permissions'] as $permissionName) {
                $preset->permissions()->create([
                    'permission_name' => $permissionName,
                ]);
            }
        }
    }
}
