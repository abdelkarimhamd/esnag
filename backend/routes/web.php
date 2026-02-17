<?php

use App\Http\Controllers\Api\ExportController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::middleware('signed')->get('/exports/download/{exportJob}', [ExportController::class, 'signedDownload'])
    ->name('exports.download.signed');

