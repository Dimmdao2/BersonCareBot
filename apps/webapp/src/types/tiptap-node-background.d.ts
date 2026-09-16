import '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    nodeBackground: {
      setNodeBackgroundColor: (backgroundColor: string) => ReturnType;
      unsetNodeBackgroundColor: () => ReturnType;
      toggleNodeBackgroundColor: (backgroundColor: string) => ReturnType;
    };
  }
}
