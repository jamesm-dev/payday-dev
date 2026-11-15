-- Marks each account's main pay: the income that repeats every 14 days and is still running, or,
-- when none is, the one that ran last by id. Among several, the lowest id. Until now every such
-- income was a payday; one is now named the main pay, and the paydays follow it. A person's
-- schedule keeps behaving as it did, because the engine treats "none marked" the same way.
--
-- Idempotent: an account that already has a main pay (this ran before, or the owner chose one) is
-- left alone, so running it twice changes nothing. Only an UPDATE of the column the previous
-- migration added; nothing is renamed or dropped, so the code that ran before this still works.
-- The backup restore (fullBackup.ts) infers the main pay of a version 1 file by the same rule.
UPDATE "payday"."schedule_item" AS s
SET "is_main_pay" = true
WHERE s."kind" = 'income'
	AND s."rule_kind" = 'every14'
	AND s."id" = (
		SELECT m."id"
		FROM "payday"."schedule_item" AS m
		WHERE m."account_id" = s."account_id" AND m."kind" = 'income' AND m."rule_kind" = 'every14'
		ORDER BY (m."ends_on" IS NOT NULL), m."id"
		LIMIT 1
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "payday"."schedule_item" AS x
		WHERE x."account_id" = s."account_id" AND x."is_main_pay"
	);
