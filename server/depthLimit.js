import { GraphQLError, Kind } from 'graphql';

export function depthLimitRule(maxDepth) {
  return (context) => {
    const fragments = new Map();
    for (const def of context.getDocument().definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
    }

    const depthOf = (selectionSet, seen = new Set()) => {
      let max = 0;
      for (const sel of selectionSet?.selections ?? []) {
        if (sel.kind === Kind.FIELD) {
          if (sel.name.value.startsWith('__')) continue;
          max = Math.max(max, 1 + depthOf(sel.selectionSet, seen));
        } else if (sel.kind === Kind.INLINE_FRAGMENT) {
          max = Math.max(max, depthOf(sel.selectionSet, seen));
        } else if (sel.kind === Kind.FRAGMENT_SPREAD && !seen.has(sel.name.value)) {
          const fragment = fragments.get(sel.name.value);
          if (fragment) max = Math.max(max, depthOf(fragment.selectionSet, new Set(seen).add(sel.name.value)));
        }
      }
      return max;
    };

    return {
      OperationDefinition(node) {
        const depth = depthOf(node.selectionSet);
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`Запрос слишком глубокий: ${depth} (максимум ${maxDepth})`, {
              nodes: [node],
              extensions: { code: 'BAD_USER_INPUT' },
            }),
          );
        }
      },
    };
  };
}
