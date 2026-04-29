import { configureStore } from "@reduxjs/toolkit";
import chatReducer from "./slices/chatSlice";
import mcpReducer from "./slices/mcpSlice";
import createProjectReducer from "./slices/createProjectSlice";
import myProjectsReducer from "./slices/myProjects";
import skillsReducer from "./slices/skillsSlice";
import transcriptReducer from "./slices/transcriptSlice";
import issuesReducer from "./slices/issuesSlice";

export const store = configureStore({
	reducer: {
		chat: chatReducer,
		mcp: mcpReducer,
		createProject: createProjectReducer,
		myProjects: myProjectsReducer,
		skills: skillsReducer,
		transcript: transcriptReducer,
		issues: issuesReducer,
	},
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
