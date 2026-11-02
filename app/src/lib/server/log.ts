export type LogLine = {
	level: 'info' | 'warn' | 'error';
	msg: string;
	[field: string]: unknown;
};

export type Logger = (line: LogLine) => void;

/** One JSON object per line on stdout or stderr, which is what `fly logs` collects. */
export const log: Logger = (line) => {
	const text = JSON.stringify({ at: new Date().toISOString(), ...line });
	if (line.level === 'error') console.error(text);
	else console.log(text);
};
