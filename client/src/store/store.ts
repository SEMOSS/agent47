import { configureStore } from "@reduxjs/toolkit";
import chatReducer from "./slices/chatSlice";
import mcpReducer from "./slices/mcpSlice";
import createProjectReducer from "./slices/createProjectSlice";
import myProjectsReducer from "./slices/myProjects";
import skillsReducer from "./slices/skillsSlice";
import transcriptReducer from "./slices/transcriptSlice";
import issuesReducer from "./slices/issuesSlice";
import enginesReducer from "./slices/enginesSlice";
import gitReducer from "./slices/gitSlice";
import hooksReducer from "./slices/hooksSlice";

export const store = configureStore({
	reducer: {
		chat: chatReducer,
		mcp: mcpReducer,
		createProject: createProjectReducer,
		myProjects: myProjectsReducer,
		skills: skillsReducer,
		transcript: transcriptReducer,
		issues: issuesReducer,
		engines: enginesReducer,
		git: gitReducer,
		hooks: hooksReducer,
	},
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
