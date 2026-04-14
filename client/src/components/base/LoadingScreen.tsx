import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface LoadingScreenProps {
	/** Whether to overlay the loading screen on top of existing content */
	overlay?: boolean;
}

/**
 * Returns a loading screen with a centered circular progress indicator
 *
 * @component
 */
export const LoadingScreen = ({ overlay = false }: LoadingScreenProps) => (
	<div
		className={cn(
			"flex flex-col items-center justify-center gap-3 h-full",
			overlay &&
				"absolute inset-0 bg-background/60 backdrop-blur-sm z-50",
		)}
	>
		<div className="relative flex items-center justify-center">
			<div className="absolute h-12 w-12 rounded-full bg-primary/20 blur-xl animate-pulse-soft" />
			<Spinner className="relative size-8 text-primary" />
		</div>
		<p className="text-xs text-muted-foreground animate-pulse">
			Loading...
		</p>
	</div>
);
