<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Support\PermissionCatalog;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

use function setPermissionsTeamId;

class RbacSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (PermissionCatalog::all() as $permissionName) {
            Permission::query()->firstOrCreate([
                'name' => $permissionName,
                'guard_name' => 'web',
            ]);
        }
    }

    public static function seedRolesForOrganization(Organization $organization): void
    {
        setPermissionsTeamId($organization->id);

        foreach (PermissionCatalog::roleMap() as $roleName => $permissions) {
            $role = Role::query()->firstOrCreate([
                'name' => $roleName,
                'guard_name' => 'web',
                'organization_id' => $organization->id,
            ]);

            $role->syncPermissions($permissions);
        }
    }
}

