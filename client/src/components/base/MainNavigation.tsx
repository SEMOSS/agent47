import { useInsight } from "@semoss/sdk/react";
import { useNavigate } from "react-router-dom";
import { SemossBlueLogo } from "@/assets";
import { Button } from "@/components/ui/button";
import { UserProfileMenu } from "./UserProfileMenu";

// The list of the buttons that should be displayed
const navigationButtons: {
	path: string;
	text: string;
}[] = [
	{
		path: "/",
		text: "Home",
	},
];

/**
 * The main navigation bar allowing users to move between pages, if they are authorized.
 *
 * @component
 */
export const MainNavigation = () => {
	const { isAuthorized } = useInsight(); // Read whether the user is authorized, so that buttons only work if they are
	const navigate = useNavigate();

	return (
		<div className="h-16 px-4 border-b border-white/20 dark:border-white/10 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl shadow-sm">
			<div className="flex items-center justify-between h-full">
				<div className="flex items-center space-x-4">
					{/* Display the logo and the title, and have clicking them take users home */}
					{isAuthorized ? (
						<button
							className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-all duration-200 hover:scale-[1.02]"
							onClick={() => navigate("/")}
							type="button"
						>
							<img
								src={SemossBlueLogo}
								alt="Semoss Blue Logo"
								className="h-12"
							/>
							<h1 className="text-xl font-bold whitespace-nowrap">
								Agent
							</h1>
						</button>
					) : (
						<div className="flex items-center space-x-2">
							<img
								src={SemossBlueLogo}
								alt="Semoss Blue Logo"
								className="h-12"
							/>
							<h1 className="text-xl font-bold whitespace-nowrap">
								Agent
							</h1>
						</div>
					)}

					{/* Display the navigation buttons when authorized */}
					{isAuthorized &&
						navigationButtons.map((page) => (
							<Button
								key={page.path}
								onClick={() => navigate(page.path)}
								variant="ghost"
							>
								{page.text}
							</Button>
						))}
				</div>

				{/* If the user is logged in, allow them to see their info */}
				{isAuthorized && <UserProfileMenu />}
			</div>
		</div>
	);
};
