import { Fragment, type ReactNode } from "react";

type MarkdownRendererProps = {
	content: string;
	className?: string;
};

type MarkdownBlock =
	| { type: "heading"; level: number; content: string }
	| { type: "paragraph"; content: string }
	| { type: "unordered-list"; items: string[] }
	| { type: "ordered-list"; items: string[] }
	| { type: "code"; language: string; content: string }
	| { type: "blockquote"; lines: string[] }
	| { type: "horizontal-rule" };

type InlineToken =
	| { type: "text"; content: string }
	| { type: "code"; content: string }
	| { type: "bold"; content: string }
	| { type: "link"; content: string; href: string };

const isHorizontalRule = (line: string) => {
	const trimmed = line.trim();
	return /^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed);
};

const parseMarkdownBlocks = (markdown: string): MarkdownBlock[] => {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const blocks: MarkdownBlock[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];
		const trimmed = line.trim();

		if (!trimmed) {
			index += 1;
			continue;
		}

		const codeStart = trimmed.match(/^```(\w+)?\s*$/);
		if (codeStart) {
			const language = codeStart[1] ?? "";
			index += 1;
			const codeLines: string[] = [];
			while (
				index < lines.length &&
				!lines[index].trim().startsWith("```")
			) {
				codeLines.push(lines[index]);
				index += 1;
			}
			if (index < lines.length) {
				index += 1;
			}
			blocks.push({
				type: "code",
				language,
				content: codeLines.join("\n"),
			});
			continue;
		}

		if (isHorizontalRule(line)) {
			blocks.push({ type: "horizontal-rule" });
			index += 1;
			continue;
		}

		const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			blocks.push({
				type: "heading",
				level: headingMatch[1].length,
				content: headingMatch[2],
			});
			index += 1;
			continue;
		}

		if (trimmed.startsWith(">")) {
			const quoteLines: string[] = [];
			while (index < lines.length) {
				const quoteLine = lines[index].trim();
				if (!quoteLine.startsWith(">")) {
					break;
				}
				quoteLines.push(quoteLine.replace(/^>\s?/, ""));
				index += 1;
			}
			blocks.push({ type: "blockquote", lines: quoteLines });
			continue;
		}

		if (/^[-*+]\s+/.test(trimmed)) {
			const items: string[] = [];
			while (index < lines.length) {
				const listLine = lines[index].trim();
				const listMatch = listLine.match(/^[-*+]\s+(.*)$/);
				if (!listMatch) {
					break;
				}
				items.push(listMatch[1]);
				index += 1;
			}
			blocks.push({ type: "unordered-list", items });
			continue;
		}

		if (/^\d+\.\s+/.test(trimmed)) {
			const items: string[] = [];
			while (index < lines.length) {
				const listLine = lines[index].trim();
				const listMatch = listLine.match(/^\d+\.\s+(.*)$/);
				if (!listMatch) {
					break;
				}
				items.push(listMatch[1]);
				index += 1;
			}
			blocks.push({ type: "ordered-list", items });
			continue;
		}

		const paragraphLines: string[] = [];
		while (index < lines.length) {
			const paragraphLine = lines[index];
			const paragraphTrimmed = paragraphLine.trim();
			if (!paragraphTrimmed) {
				break;
			}
			if (
				/^```/.test(paragraphTrimmed) ||
				/^(#{1,6})\s+/.test(paragraphTrimmed) ||
				/^>\s?/.test(paragraphTrimmed) ||
				/^[-*+]\s+/.test(paragraphTrimmed) ||
				/^\d+\.\s+/.test(paragraphTrimmed) ||
				isHorizontalRule(paragraphTrimmed)
			) {
				break;
			}
			paragraphLines.push(paragraphTrimmed);
			index += 1;
		}
		blocks.push({
			type: "paragraph",
			content: paragraphLines.join(" "),
		});
	}

	return blocks;
};

const pushTextToken = (tokens: InlineToken[], value: string) => {
	if (!value) {
		return;
	}
	tokens.push({ type: "text", content: value });
};

const parseInlineTokens = (value: string): InlineToken[] => {
	const tokens: InlineToken[] = [];
	let cursor = 0;

	while (cursor < value.length) {
		const remaining = value.slice(cursor);
		const matches = [
			{
				type: "code" as const,
				match: /`([^`]+)`/.exec(remaining),
			},
			{
				type: "link" as const,
				match: /\[([^\]]+)\]\(([^)\s]+)\)/.exec(remaining),
			},
			{
				type: "bold" as const,
				match: /\*\*([^*]+)\*\*/.exec(remaining),
			},
		]
			.filter((entry) => entry.match)
			.map((entry) => ({
				type: entry.type,
				match: entry.match as RegExpExecArray,
			}));

		if (matches.length === 0) {
			pushTextToken(tokens, remaining);
			break;
		}

		const nextMatch = matches.reduce((closest, current) =>
			current.match.index < closest.match.index ? current : closest,
		);

		if (nextMatch.match.index > 0) {
			pushTextToken(tokens, remaining.slice(0, nextMatch.match.index));
		}

		if (nextMatch.type === "code") {
			tokens.push({ type: "code", content: nextMatch.match[1] });
		} else if (nextMatch.type === "bold") {
			tokens.push({ type: "bold", content: nextMatch.match[1] });
		} else if (nextMatch.type === "link") {
			tokens.push({
				type: "link",
				content: nextMatch.match[1],
				href: nextMatch.match[2],
			});
		}

		cursor += nextMatch.match.index + nextMatch.match[0].length;
	}

	return tokens;
};

const renderInline = (content: string, keyPrefix: string): ReactNode[] =>
	parseInlineTokens(content).map((token, index) => {
		const key = `${keyPrefix}-${index}`;

		if (token.type === "text") {
			return <Fragment key={key}>{token.content}</Fragment>;
		}

		if (token.type === "code") {
			return (
				<code
					key={key}
					className="rounded bg-muted px-1 py-0.5 text-xs"
				>
					{token.content}
				</code>
			);
		}

		if (token.type === "bold") {
			return <strong key={key}>{token.content}</strong>;
		}

		return (
			<a
				key={key}
				href={token.href}
				target="_blank"
				rel="noreferrer"
				className="text-primary underline underline-offset-2"
			>
				{token.content}
			</a>
		);
	});

export const MarkdownRenderer = ({
	content,
	className,
}: MarkdownRendererProps) => {
	const blocks = parseMarkdownBlocks(content);

	return (
		<div className={className}>
			{blocks.map((block, blockIndex) => {
				const key = `markdown-block-${blockIndex}`;

				if (block.type === "heading") {
					const headingClass =
						block.level <= 2
							? "text-lg font-semibold"
							: block.level === 3
								? "text-base font-semibold"
								: "text-sm font-semibold";

					return (
						<h3
							key={key}
							className={`${headingClass} mt-4 first:mt-0`}
						>
							{renderInline(block.content, key)}
						</h3>
					);
				}

				if (block.type === "unordered-list") {
					return (
						<ul key={key} className="my-2 list-disc space-y-1 pl-5">
							{block.items.map((item, itemIndex) => (
								<li key={`${key}-item-${itemIndex}`}>
									{renderInline(
										item,
										`${key}-item-${itemIndex}`,
									)}
								</li>
							))}
						</ul>
					);
				}

				if (block.type === "ordered-list") {
					return (
						<ol
							key={key}
							className="my-2 list-decimal space-y-1 pl-5"
						>
							{block.items.map((item, itemIndex) => (
								<li key={`${key}-item-${itemIndex}`}>
									{renderInline(
										item,
										`${key}-item-${itemIndex}`,
									)}
								</li>
							))}
						</ol>
					);
				}

				if (block.type === "code") {
					return (
						<div
							key={key}
							className="my-3 overflow-x-auto rounded-md border border-border/70 bg-muted/40"
						>
							<pre className="p-3 text-xs">
								{block.language ? (
									<code data-language={block.language}>
										{block.content}
									</code>
								) : (
									<code>{block.content}</code>
								)}
							</pre>
						</div>
					);
				}

				if (block.type === "blockquote") {
					return (
						<blockquote
							key={key}
							className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
						>
							{block.lines.map((line, lineIndex) => (
								<p key={`${key}-line-${lineIndex}`}>
									{renderInline(
										line,
										`${key}-line-${lineIndex}`,
									)}
								</p>
							))}
						</blockquote>
					);
				}

				if (block.type === "horizontal-rule") {
					return <hr key={key} className="my-4 border-border/70" />;
				}

				return (
					<p key={key} className="my-2 leading-relaxed">
						{renderInline(block.content, key)}
					</p>
				);
			})}
		</div>
	);
};
