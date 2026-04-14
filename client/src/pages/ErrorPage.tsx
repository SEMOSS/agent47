import { TriangleAlert } from "lucide-react";

/**
 * Renders a warning message for any FE errors encountered.
 *
 * @component
 */
export const ErrorPage = () => {
	return (
		<div className="flex min-h-full items-center justify-center px-4">
			<div className="relative rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 p-10 text-center shadow-xl shadow-slate-400/10 dark:shadow-black/20 backdrop-blur-xl max-w-md">
				<div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 h-32 w-32 rounded-full bg-red-200/40 dark:bg-red-500/15 blur-2xl" />
				<div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
					<TriangleAlert className="size-8 text-destructive" />
				</div>
				<h2 className="text-lg font-semibold mb-2">
					Something went wrong
				</h2>
				<p className="text-sm text-muted-foreground">
					An error has occurred. Please try again or contact support
					if the problem persists.
				</p>
			</div>
		</div>
	);
};
