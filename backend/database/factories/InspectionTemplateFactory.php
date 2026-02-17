<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\InspectionTemplate>
 */
class InspectionTemplateFactory extends Factory
{
    public function definition(): array
    {
        $fieldKey = Str::slug(fake()->words(2, true), '_');

        return [
            'organization_id' => Organization::factory(),
            'project_id' => Project::factory()->state(fn (array $attributes) => [
                'organization_id' => $attributes['organization_id'],
            ]),
            'name' => fake()->randomElement([
                'NCR Structural Inspection',
                'RFI Site Verification',
                'Safety Walk Checklist',
                'Permit Compliance Review',
                'Commissioning Test Log',
                'Handover Pre-Check',
            ]),
            'code' => 'TPL-'.Str::upper(fake()->bothify('??-###')),
            'type' => fake()->randomElement(['ncr', 'rfi', 'safety', 'permit', 'commissioning', 'checklist', 'handover']),
            'discipline' => fake()->randomElement(['Architectural', 'Civil', 'Electrical', 'Mechanical', 'QA/QC', 'Safety']),
            'description' => fake()->sentence(),
            'schema' => [
                'sections' => [
                    [
                        'title' => 'General',
                        'fields' => [
                            [
                                'key' => $fieldKey.'_text',
                                'label' => 'Observation',
                                'type' => 'textarea',
                                'required' => true,
                            ],
                            [
                                'key' => $fieldKey.'_date',
                                'label' => 'Inspection Date',
                                'type' => 'date',
                                'required' => true,
                            ],
                        ],
                    ],
                ],
            ],
            'approval_workflow' => [
                [
                    'step_order' => 1,
                    'step_name' => 'Consultant Review',
                    'role_name' => 'inspector',
                    'requires_signature' => false,
                ],
                [
                    'step_order' => 2,
                    'step_name' => 'Owner Sign-Off',
                    'role_name' => 'org_admin',
                    'requires_signature' => true,
                ],
            ],
            'is_active' => true,
            'is_library' => false,
            'library_key' => null,
            'version' => 1,
            'created_by' => User::factory(),
        ];
    }
}
