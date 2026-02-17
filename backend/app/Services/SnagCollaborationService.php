<?php

namespace App\Services;

use App\Models\Snag;
use App\Models\SnagComment;
use App\Models\SnagCommentMention;
use App\Models\SnagWatcher;
use App\Models\StakeholderTeam;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class SnagCollaborationService
{
    public const WATCH_SOURCE_MANUAL = 'manual';
    public const WATCH_SOURCE_ASSIGNED = 'assigned';
    public const WATCH_SOURCE_COMMENT = 'comment';
    public const WATCH_SOURCE_MENTION = 'mention';
    public const WATCH_SOURCE_TEAM_MENTION = 'team_mention';
    public const WATCH_SOURCE_ESCALATION = 'escalation';

    /**
     * @param  iterable<int, int|User>  $users
     */
    public function addWatchers(Snag $snag, iterable $users, string $source, ?int $createdBy = null): void
    {
        $userIds = collect($users)
            ->map(fn ($entry) => $entry instanceof User ? $entry->id : (int) $entry)
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->values();

        if ($userIds->isEmpty()) {
            return;
        }

        $validUserIds = User::query()
            ->whereIn('id', $userIds)
            ->whereHas('organizations', function (Builder $query) use ($snag): void {
                $query->where('organizations.id', $snag->organization_id)
                    ->where('organization_user.is_active', true);
            })
            ->pluck('id');

        if ($validUserIds->isEmpty()) {
            return;
        }

        $existing = SnagWatcher::query()
            ->where('snag_id', $snag->id)
            ->whereIn('user_id', $validUserIds)
            ->pluck('user_id')
            ->all();

        $missingUserIds = $validUserIds->reject(fn (int $id) => in_array($id, $existing, true));
        if ($missingUserIds->isEmpty()) {
            return;
        }

        $rows = $missingUserIds
            ->map(fn (int $userId) => [
                'organization_id' => $snag->organization_id,
                'snag_id' => $snag->id,
                'user_id' => $userId,
                'source' => $source,
                'created_by' => $createdBy,
                'created_at' => now(),
                'updated_at' => now(),
            ])
            ->all();

        SnagWatcher::query()->insert($rows);
    }

    public function removeWatcher(Snag $snag, int $userId): void
    {
        SnagWatcher::query()
            ->where('snag_id', $snag->id)
            ->where('user_id', $userId)
            ->delete();
    }

    public function autoWatchDefaultStakeholders(Snag $snag, ?int $createdBy = null): void
    {
        $this->addWatchers($snag, array_filter([$snag->created_by, $snag->assigned_to]), self::WATCH_SOURCE_ASSIGNED, $createdBy);
    }

    public function autoWatchCommentActor(Snag $snag, int $actorUserId): void
    {
        $this->addWatchers($snag, [$actorUserId], self::WATCH_SOURCE_COMMENT, $actorUserId);
    }

    /**
     * @param  array<int, int>  $explicitUserIds
     * @param  array<int, int>  $explicitTeamIds
     * @return array{
     *   users: Collection<int, User>,
     *   teams: Collection<int, StakeholderTeam>,
     *   mention_rows: array<int, array<string, mixed>>,
     *   team_member_ids: array<int, int>
     * }
     */
    public function resolveMentions(Snag $snag, string $body, array $explicitUserIds = [], array $explicitTeamIds = []): array
    {
        [$bodyUserIds, $bodyTeamIds, $tokens] = $this->extractMentionTokens($body, $snag);

        $userIds = collect($explicitUserIds)
            ->merge($bodyUserIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->values();

        $teamIds = collect($explicitTeamIds)
            ->merge($bodyTeamIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->values();

        $users = User::query()
            ->whereIn('id', $userIds)
            ->whereHas('organizations', function ($query) use ($snag): void {
                $query->where('organizations.id', $snag->organization_id)
                    ->where('organization_user.is_active', true);
            })
            ->get();

        $teams = StakeholderTeam::query()
            ->where('organization_id', $snag->organization_id)
            ->whereIn('id', $teamIds)
            ->with(['users' => fn ($query) => $query->wherePivot('is_active', true)])
            ->get();

        $teamMemberIds = $teams
            ->flatMap(fn (StakeholderTeam $team) => $team->users->pluck('id'))
            ->unique()
            ->values()
            ->all();

        $mentionRows = [];

        foreach ($users as $user) {
            $mentionRows[] = [
                'mentioned_user_id' => $user->id,
                'mentioned_team_id' => null,
                'token' => '@user:'.$user->id,
                'meta' => ['source' => 'resolved'],
            ];
        }

        foreach ($teams as $team) {
            $mentionRows[] = [
                'mentioned_user_id' => null,
                'mentioned_team_id' => $team->id,
                'token' => '@team:'.$team->id,
                'meta' => [
                    'source' => 'resolved',
                    'team_name' => $team->name,
                ],
            ];
        }

        foreach ($tokens as $token) {
            $mentionRows[] = [
                'mentioned_user_id' => null,
                'mentioned_team_id' => null,
                'token' => $token,
                'meta' => ['source' => 'token'],
            ];
        }

        return [
            'users' => $users,
            'teams' => $teams,
            'mention_rows' => $mentionRows,
            'team_member_ids' => $teamMemberIds,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    public function persistMentions(SnagComment $comment, array $rows): void
    {
        if ($rows === []) {
            return;
        }

        foreach ($rows as $row) {
            SnagCommentMention::query()->create([
                'organization_id' => $comment->organization_id,
                'snag_comment_id' => $comment->id,
                'mentioned_user_id' => $row['mentioned_user_id'] ?? null,
                'mentioned_team_id' => $row['mentioned_team_id'] ?? null,
                'token' => $row['token'] ?? null,
                'meta' => $row['meta'] ?? null,
            ]);
        }
    }

    /**
     * @return Collection<int, User>
     */
    public function notificationRecipientsForComment(Snag $snag, int $actorUserId, ?Collection $mentionedUsers = null): Collection
    {
        $snag->loadMissing([
            'creator:id,name,email',
            'assignee:id,name,email',
            'watcherUsers:id,name,email',
        ]);

        $mentionedUsers = $mentionedUsers ?? collect();

        return collect([$snag->creator, $snag->assignee])
            ->merge($snag->watcherUsers)
            ->merge($mentionedUsers)
            ->filter()
            ->unique('id')
            ->reject(fn (User $user) => $user->id === $actorUserId)
            ->values();
    }

    /**
     * @return Collection<int, User>
     */
    public function notificationRecipientsForStatus(Snag $snag, int $actorUserId): Collection
    {
        $snag->loadMissing([
            'creator:id,name,email',
            'assignee:id,name,email',
            'watcherUsers:id,name,email',
        ]);

        return collect([$snag->creator, $snag->assignee])
            ->merge($snag->watcherUsers)
            ->filter()
            ->unique('id')
            ->reject(fn (User $user) => $user->id === $actorUserId)
            ->values();
    }

    /**
     * @return array{0: array<int, int>, 1: array<int, int>, 2: array<int, string>}
     */
    private function extractMentionTokens(string $body, Snag $snag): array
    {
        if (! preg_match_all('/@(?:(user|team):)?([A-Za-z0-9._\-]+)/', $body, $matches, PREG_SET_ORDER)) {
            return [[], [], []];
        }

        $userIds = [];
        $teamIds = [];
        $rawTokens = [];

        $usersByLocal = User::query()
            ->whereHas('organizations', function ($query) use ($snag): void {
                $query->where('organizations.id', $snag->organization_id)
                    ->where('organization_user.is_active', true);
            })
            ->get(['id', 'name', 'email'])
            ->mapWithKeys(function (User $user): array {
                $emailLocal = strtolower((string) strtok($user->email, '@'));
                $nameSlug = strtolower((string) preg_replace('/[^a-z0-9]+/', '.', trim($user->name)));

                return array_filter([
                    $emailLocal => $user->id,
                    $nameSlug => $user->id,
                ], fn ($key) => ! empty($key), ARRAY_FILTER_USE_KEY);
            });

        $teamsByLookup = StakeholderTeam::query()
            ->where('organization_id', $snag->organization_id)
            ->get(['id', 'name', 'code'])
            ->mapWithKeys(function (StakeholderTeam $team): array {
                $nameSlug = strtolower((string) preg_replace('/[^a-z0-9]+/', '-', trim($team->name)));
                $code = strtolower((string) ($team->code ?? ''));

                return array_filter([
                    $nameSlug => $team->id,
                    $code => $team->id,
                ], fn ($key) => ! empty($key), ARRAY_FILTER_USE_KEY);
            });

        foreach ($matches as $match) {
            $prefix = strtolower((string) ($match[1] ?? ''));
            $identifier = strtolower((string) ($match[2] ?? ''));
            $rawTokens[] = '@'.($prefix ? $prefix.':' : '').$identifier;

            if ($prefix === 'team') {
                if (is_numeric($identifier)) {
                    $teamIds[] = (int) $identifier;
                } elseif ($teamsByLookup->has($identifier)) {
                    $teamIds[] = (int) $teamsByLookup->get($identifier);
                }

                continue;
            }

            if ($prefix === 'user') {
                if (is_numeric($identifier)) {
                    $userIds[] = (int) $identifier;
                } elseif ($usersByLocal->has($identifier)) {
                    $userIds[] = (int) $usersByLocal->get($identifier);
                }

                continue;
            }

            if (is_numeric($identifier)) {
                $userIds[] = (int) $identifier;
                continue;
            }

            if ($usersByLocal->has($identifier)) {
                $userIds[] = (int) $usersByLocal->get($identifier);
            } elseif ($teamsByLookup->has($identifier)) {
                $teamIds[] = (int) $teamsByLookup->get($identifier);
            }
        }

        return [
            array_values(array_unique($userIds)),
            array_values(array_unique($teamIds)),
            array_values(array_unique($rawTokens)),
        ];
    }
}
