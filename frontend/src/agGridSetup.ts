import {
  AllCommunityModule,
  ModuleRegistry,
  colorSchemeDark,
  themeQuartz,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

export const lightTheme = themeQuartz;
export const darkTheme = themeQuartz.withPart(colorSchemeDark);
