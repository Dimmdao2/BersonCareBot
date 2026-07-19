export function contentMobileBackTarget(input: {
  editingPage: boolean;
  creatingPage: boolean;
}): "materials" | "sections" {
  return input.editingPage || input.creatingPage ? "materials" : "sections";
}
