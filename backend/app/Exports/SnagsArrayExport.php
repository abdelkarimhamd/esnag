<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class SnagsArrayExport implements FromArray, WithHeadings
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
            'Title / العنوان',
            'Status / الحالة',
            'Priority / الأولوية',
            'Project / المشروع',
            'Drawing / المخطط',
            'Assignee / المسؤول',
            'Trade / التخصص',
            'Closeout Completion % / نسبة الإقفال',
            'Due Date / تاريخ الاستحقاق',
            'Closed At / تاريخ الإغلاق',
            'Created At / تاريخ الإنشاء',
        ];
    }
}
