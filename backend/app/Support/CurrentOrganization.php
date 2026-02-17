<?php

namespace App\Support;

use App\Models\Organization;

class CurrentOrganization
{
    public function __construct(
        public readonly ?Organization $organization = null,
    ) {
    }

    public function id(): ?int
    {
        return $this->organization?->id;
    }

    public function has(): bool
    {
        return $this->organization !== null;
    }
}

