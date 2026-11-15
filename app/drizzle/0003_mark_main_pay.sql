-- Marks each account's main pay: the lowest-id income that repeats every 14 days. Until now every
-- such income was a payday; one is now named the main pay, and the paydays follow it. A person's
-- schedule keeps behaving as it did, because the engine treats "none marked" the same way.
--
-- Idempotent: an account that already has a main pay (this ran before, or the owner chose one) is
-- left alone, so running it twice changes nothing. Only an UPDATE of the column the previous
-- migration added; nothing is renamed or dropped, so the code that ran before this still works.
UPDATE "payday"."schedule_item" AS s
SET "is_main_pay" = true
WHERE s."kind" = 'income'
	AND s."rule_kind" = 'every14'
	AND s."id" = (
		SELECT min(m."id")
		FROM "payday"."schedule_item" AS m
		WHERE m."account_id" = s."account_id" AND m."kind" = 'income' AND m."rule_kind" = 'every14'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "payday"."schedule_item" AS x
		WHERE x."account_id" = s."account_id" AND x."is_main_pay"
	);
