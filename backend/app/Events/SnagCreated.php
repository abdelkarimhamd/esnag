<?php

namespace App\Events;

use App\Models\Snag;
use App\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SnagCreated
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly Snag $snag,
        public readonly User $actor,
    ) {
    }
}
