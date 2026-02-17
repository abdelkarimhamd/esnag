<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class InspectionArrayExport implements FromArray, WithHeadings
{
    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @param  array<int, string>|null  $headings
     */
    public function __construct(
        private readonly array $rows,
        private readonly ?array $headings = null,
    ) {
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function array(): array
    {
        return $this->rows;
    }

    /**
     * @return array<int, string>
     */
    public function headings(): array
    {
        return $this->headings ?? self::defaultHeadings();
    }

    /**
     * @return array<int, string>
     */
    public static function defaultHeadings(): array
    {
        return [
            'Reference / المرجع',
            'Template / النموذج',
            'Type / النوع',
            'Status / الحالة',
            'Project / المشروع',
            'Submitted By / مقدم الطلب',
            'Current Approval Step / خطوة الاعتماد الحالية',
            'Approvals (Done/Total) / الاعتمادات (منجز/الإجمالي)',
            'Signatures / التواقيع',
            'Open Requests / الطلبات المفتوحة',
            'Submitted At / تاريخ الإرسال',
            'Approved At / تاريخ الاعتماد',
            'Created At / تاريخ الإنشاء',
        ];
    }
}
