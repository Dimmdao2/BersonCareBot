import type { RubitimeMappingPort, RubitimeMappingService } from "./ports";

export function createRubitimeMappingService(port: RubitimeMappingPort): RubitimeMappingService {
  return {
    listMappings(query) {
      return port.listMappings(query);
    },
    linkMapping(input) {
      return port.linkMapping(input);
    },
  };
}
