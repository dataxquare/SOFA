import {
  DocumentNode,
  GraphQLSchema,
  VariableDefinitionNode,
  TypeNode,
  OperationDefinitionNode,
  ObjectTypeDefinitionNode,
  FieldNode,
  parse,
  printType,
  Kind,
} from 'graphql';

import { getOperationInfo } from '../ast';
import { mapToPrimitive, mapToRef } from './utils';
import { resolveFieldType } from './types';
import { titleCase } from 'title-case';

export function buildPathFromOperation({
  url,
  schema,
  operation,
  useRequestBody,
  tags
}: {
  url: string;
  schema: GraphQLSchema;
  operation: DocumentNode;
  useRequestBody: boolean;
  tags?: string[]
}): any {
  const info = getOperationInfo(operation)!;

  const description = resolveDescription(schema, info.operation);

  return {
    operationId: info.name,
    ...(useRequestBody
      ? {
          requestBody: {
            content: {
              'application/json': {
                schema: resolveRequestBody(info.operation.variableDefinitions),
              },
            },
          },
        }
      : {
          parameters: resolveParameters(
            url,
            info.operation.variableDefinitions
          ),
        }),
    tags,
    responses: {
      200: {
        description,
        content: {
          'application/json': {
            schema: resolveResponse({
              schema,
              operation: info.operation,
            }),
          },
        },
      },
    },
  };
}

function resolveParameters(
  url: string,
  variables: ReadonlyArray<VariableDefinitionNode> | undefined
) {
  if (!variables) {
    return [];
  }

  return variables.map((variable: any) => {
    return {
      in: isInPath(url, variable.variable.name.value) ? 'path' : 'query',
      name: variable.variable.name.value,
      required: variable.type.kind === Kind.NON_NULL_TYPE,
      schema: resolveParamSchema(variable.type),
    };
  });
}

function resolveRequestBody(
  variables: ReadonlyArray<VariableDefinitionNode> | undefined
) {
  if (!variables) {
    return {};
  }

  const properties: Record<string, any> = {};
  const required: string[] = [];

  variables.forEach(variable => {
    if (variable.type.kind === Kind.NON_NULL_TYPE) {
      required.push(variable.variable.name.value);
    }

    properties[variable.variable.name.value] = resolveParamSchema(
      variable.type
    );
  });

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

// array -> [type]
// type -> $ref
// scalar -> swagger primitive
function resolveParamSchema(type: TypeNode): any {
  if (type.kind === Kind.NON_NULL_TYPE) {
    return resolveParamSchema(type.type);
  }

  if (type.kind === Kind.LIST_TYPE) {
    return {
      type: 'array',
      items: resolveParamSchema(type.type),
    };
  }

  const primitive = mapToPrimitive(type.name.value);

  return (
    primitive || {
      $ref: mapToRef(type.name.value),
    }
  );
}

function resolveResponse({
  schema,
  operation,
}: {
  schema: GraphQLSchema;
  operation: OperationDefinitionNode;
}) {
  const operationType = operation.operation;
  const rootField = operation.selectionSet.selections[0];

  if (rootField.kind === Kind.FIELD) {
    if (operationType === 'query') {
      const queryType = schema.getQueryType()!;
      const field = queryType.getFields()[rootField.name.value];

      return resolveFieldType(field.type);
    }

    if (operationType === 'mutation') {
      const mutationType = schema.getMutationType()!;
      const field = mutationType.getFields()[rootField.name.value];

      return resolveFieldType(field.type);
    }
  }
}

function isInPath(url: string, param: string): boolean {
  return url.indexOf(`{${param}}`) !== -1;
}

function resolveDescription(
  schema: GraphQLSchema,
  operation: OperationDefinitionNode
) {
  const selection = operation.selectionSet.selections[0] as FieldNode;
  const fieldName = selection.name.value;
  const typeDefinition = schema.getType(titleCase(operation.operation));

  if (!typeDefinition) {
    return '';
  }

  const definitionNode =
    typeDefinition.astNode || parse(printType(typeDefinition)).definitions[0];

  if (!isObjectTypeDefinitionNode(definitionNode)) {
    return '';
  }

  const fieldNode = definitionNode.fields!.find(
    field => field.name.value === fieldName
  );
  const descriptionDefinition = fieldNode && fieldNode.description;
  return descriptionDefinition && descriptionDefinition.value
    ? descriptionDefinition.value
    : '';
}

function isObjectTypeDefinitionNode(
  node: any
): node is ObjectTypeDefinitionNode {
  return node.kind === Kind.OBJECT_TYPE_DEFINITION;
}
