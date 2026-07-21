import type { RiotV3LanguageOptions } from './options';
import { scanBalanced } from './scanners';
import type { EachScope, TemplateEventBinding } from './template';
import {
  formatObjectType,
  formatUnionType,
  parseObjectType,
  splitTopLevelUnionTypes,
} from './typeSyntax';
import type { GeneratedSegment, JSDocTypedef, ScriptProperty } from './types';

const riotV3GlobalTypes = `
type RiotV3Selector = string | HTMLElement | NodeList | ArrayLike<HTMLElement>;
type RiotV3Options = Record<string, any>;
type RiotV3TagFactory = (opts?: RiotV3Options) => void;
type RiotV3EachItem<T> =
	T extends readonly (infer Item)[] ? Item :
	T extends string ? string :
	T extends Record<string, infer Item> ? Item :
	any;
type RiotV3EachIndex<T> =
	T extends readonly unknown[] | string ? number :
	T extends object ? Extract<keyof T, string> :
	any;
type RiotV3PathValue<T, Path extends readonly PropertyKey[]> =
	Path extends readonly [infer Head extends PropertyKey, ...infer Tail extends PropertyKey[]] ?
		Head extends keyof T ? RiotV3PathValue<T[Head], Tail> : any :
	T;
type RiotV3Event<NativeEvent extends Event, Item> = NativeEvent & {
	item: Item;
	which?: number;
	preventUpdate?: boolean;
};
type RiotV3NativeEvent<Name extends string> =
	Name extends keyof GlobalEventHandlersEventMap ? GlobalEventHandlersEventMap[Name] : Event;
type RiotV3EachObject<T> =
	T extends object ? Omit<T, 'opts' | 'parent'> : {};
type RiotV3EachData<Current, Parent> =
	RiotV3EachObject<Current> & Omit<Parent, keyof RiotV3EachObject<Current>>;
type RiotV3TemplateContext<Instance, State> =
	Instance & Omit<typeof globalThis, keyof State>;
type RiotV3TypedEachContext<Data, Parent> =
	RiotV3TemplateContext<RiotV3EachContext & Data & { parent: Parent }, Data>;

interface RiotV3Observable {
	on(events: string, callback: (...args: any[]) => void): this;
	one(events: string, callback: (...args: any[]) => void): this;
	off(events?: string, callback?: (...args: any[]) => void): this;
	trigger(events: string, ...args: any[]): this;
}

interface RiotV3TagInstance extends RiotV3Observable {
	[key: string]: any;
	root: HTMLElement;
	opts: RiotV3Options;
	refs: Record<string, HTMLElement | RiotV3TagInstance>;
	tags: Record<string, RiotV3TagInstance | RiotV3TagInstance[]>;
	parent?: RiotV3TagInstance;
	isMounted: boolean;
	_riot_id: number;
	update(data?: RiotV3Options): this;
	mixin(name: string): this;
	mixin(mixin: Record<string, any>): this;
	mount(): this;
	unmount(keepRootTag?: boolean): void;
}

interface RiotV3TemplateInstance {
	[key: string]: any;
	opts: RiotV3Options;
}

interface RiotV3EachContext extends RiotV3TemplateInstance {
	[key: string]: any;
	parent: RiotV3TemplateInstance;
}

interface RiotV3Static {
	Tag: {
		new(el: HTMLElement, opts?: RiotV3Options): RiotV3TagInstance;
	};
	tag(name: string, tmpl: string, css: string, attrs: string, fn: RiotV3TagFactory): string;
	tag(name: string, tmpl: string, css: string, fn: RiotV3TagFactory): string;
	tag(name: string, tmpl: string, fn: RiotV3TagFactory): string;
	tag2(name: string, tmpl: string, css: string, attrs: string, fn: RiotV3TagFactory): string;
	mount(selector: RiotV3Selector, tagName?: string, opts?: RiotV3Options): RiotV3TagInstance[];
	mount(selector: RiotV3Selector, opts?: RiotV3Options): RiotV3TagInstance[];
	mixin(name: string): Record<string, any>;
	mixin(name: string, mixin: Record<string, any>, global?: boolean): void;
	mixin(mixin: Record<string, any>): void;
	update(): RiotV3TagInstance[];
	unregister(name: string): boolean;
	version: string;
	observable<T extends object>(el?: T): T & RiotV3Observable;
	settings: Record<string, any>;
	util: Record<string, any>;
}

declare const riot: RiotV3Static;
declare const opts: RiotV3TagInstance['opts'];
`;

export interface RiotV3GlobalTypesComponentData {
  scriptProperties: ScriptProperty[];
  jsDocTypedefs: JSDocTypedef[];
  eventBindings: TemplateEventBinding[];
}

export interface GeneratedRiotV3GlobalTypes {
  text: string;
  segments: GeneratedSegment[];
}

export function generateRiotV3GlobalTypes(
  components: RiotV3GlobalTypesComponentData[],
  fileTypeScope?: string,
  options: RiotV3LanguageOptions = {},
): GeneratedRiotV3GlobalTypes {
  const dynamicTypeSegments: GeneratedSegment[] = [
    {
      text: `\ndeclare module '${getRiotV3ComponentTypesModuleName(fileTypeScope)}' {\n`,
    },
  ];
  for (let index = 0; index < components.length; index++) {
    const { scriptProperties, jsDocTypedefs, eventBindings } =
      components[index];
    const jsDocTypedefNames = new Map(
      jsDocTypedefs.map((typedef) => [
        typedef.name,
        getJSDocTypedefTypeName(index, typedef.name),
      ]),
    );
    for (const typedef of jsDocTypedefs) {
      dynamicTypeSegments.push({
        text: `\texport type ${jsDocTypedefNames.get(typedef.name)} = ${resolveJSDocTypedefReferences(typedef.typeName, jsDocTypedefNames)};\n`,
      });
    }
    dynamicTypeSegments.push({
      text: `\texport interface ${getComponentStateTypeName(index)} {\n`,
    });
    for (const property of scriptProperties) {
      dynamicTypeSegments.push({ text: '\t\t' });
      dynamicTypeSegments.push({
        text: property.name,
        sourceOffset: property.sourceOffset,
        length: property.name.length,
      });
      dynamicTypeSegments.push({
        text:
          ': ' +
          resolveJSDocTypedefReferences(
            getGeneratedPropertyTypeName(
              property,
              options,
              index,
              eventBindings,
            ),
            jsDocTypedefNames,
          ) +
          ';\n',
      });
    }
    dynamicTypeSegments.push({ text: '\t}\n' });

    const typeNames = getComponentTypeNames(index);
    dynamicTypeSegments.push({
      text: `\texport interface ${typeNames.tagInstance} extends RiotV3TagInstance, ${getComponentStateTypeName(index)} {}\n`,
    });
    dynamicTypeSegments.push({
      text: `\texport interface ${typeNames.templateInstance} extends RiotV3TemplateInstance, ${getComponentStateTypeName(index)} {}\n`,
    });
    dynamicTypeSegments.push({
      text: `\texport type ${typeNames.templateContext} = RiotV3TemplateContext<${typeNames.templateInstance}, ${getComponentStateTypeName(index)}>;\n`,
    });
  }
  dynamicTypeSegments.push({ text: '}\n' });

  return {
    text: riotV3GlobalTypes,
    segments: dynamicTypeSegments,
  };
}

function getGeneratedPropertyTypeName(
  property: ScriptProperty,
  options: RiotV3LanguageOptions,
  componentIndex: number,
  eventBindings: TemplateEventBinding[],
): string {
  const eventType = getEventHandlerPropertyType(
    property,
    componentIndex,
    eventBindings,
  );
  if (eventType) {
    return eventType;
  }
  if (
    options.allowDynamicPropertiesFromAnyAssignments &&
    property.typeOrigin === 'inferred' &&
    property.inferredAnyAssignmentPaths?.length
  ) {
    return getDynamicObjectPropertyType(property) ?? property.typeName;
  }
  return property.typeName;
}

function getEventHandlerPropertyType(
  property: ScriptProperty,
  componentIndex: number,
  eventBindings: TemplateEventBinding[],
): string | undefined {
  if (
    property.typeOrigin === 'explicit' &&
    property.hasExplicitFirstParameterType !== false
  ) {
    return;
  }
  const bindings = eventBindings.filter(
    (binding) => binding.handlerName === property.name,
  );
  if (!bindings.length) {
    return;
  }
  const eventTypes = bindings.map((binding) => {
    const nativeEvent = `RiotV3NativeEvent<${JSON.stringify(binding.eventName)}>`;
    const itemType = getEventItemType(binding.eachScopes, componentIndex);
    return `RiotV3Event<${nativeEvent}, ${itemType}>`;
  });
  const uniqueEventTypes = [...new Set(eventTypes)];
  return replaceFirstFunctionParameterType(
    property.typeName,
    uniqueEventTypes.join(' | '),
  );
}

function replaceFirstFunctionParameterType(
  functionType: string,
  eventType: string,
): string {
  const trimmed = functionType.trim();
  if (trimmed[0] !== '(') {
    return `(event: ${eventType}) => any`;
  }
  const parametersEnd = scanBalanced(trimmed, 0, '(', ')');
  if (
    parametersEnd === undefined ||
    !trimmed.slice(parametersEnd).trimStart().startsWith('=>')
  ) {
    return `(event: ${eventType}) => any`;
  }
  const parameters = trimmed.slice(1, parametersEnd - 1);
  const firstComma = findTopLevelParameterComma(parameters);
  const firstParameter = parameters.slice(0, firstComma ?? parameters.length);
  const parameterName =
    firstParameter.includes(':') &&
    !firstParameter.trimStart().startsWith('...')
      ? (firstParameter.match(/[A-Za-z_$][\w$]*/)?.[0] ?? 'event')
      : 'event';
  const remainingParameters =
    firstComma === undefined ? '' : parameters.slice(firstComma);
  return `(${parameterName}: ${eventType}${remainingParameters}) ${trimmed.slice(parametersEnd).trimStart()}`;
}

function findTopLevelParameterComma(parameters: string): number | undefined {
  for (let offset = 0; offset < parameters.length; offset++) {
    const char = parameters[offset];
    if (char === '(') {
      offset = (scanBalanced(parameters, offset, '(', ')') ?? offset + 1) - 1;
    } else if (char === '{') {
      offset = (scanBalanced(parameters, offset, '{', '}') ?? offset + 1) - 1;
    } else if (char === '[') {
      offset = (scanBalanced(parameters, offset, '[', ']') ?? offset + 1) - 1;
    } else if (char === ',') {
      return offset;
    }
  }
}

function getEventItemType(scopes: EachScope[], componentIndex: number): string {
  if (!scopes.length) {
    return 'undefined';
  }
  let parentDataType = getComponentStateTypeName(componentIndex);
  let parentContextType = parentDataType;
  let currentItemType = 'any';
  for (const scope of scopes) {
    const collectionType = getEventCollectionType(
      scope.collectionText,
      parentContextType,
    );
    currentItemType = getEventEachItemType(scope, collectionType);
    parentDataType = `RiotV3EachData<${currentItemType}, ${parentDataType}>`;
    parentContextType = `${parentDataType} & { parent: ${parentContextType} }`;
  }
  return currentItemType;
}

function getEventEachItemType(
  scope: EachScope,
  collectionType: string,
): string {
  if (scope.kind === 'shorthand') {
    return `RiotV3EachItem<${collectionType}>`;
  }
  const members = scope.localNames.map((localName) => {
    const helper =
      localName.kind === 'item' ? 'RiotV3EachItem' : 'RiotV3EachIndex';
    return `${localName.name}: ${helper}<${collectionType}>;`;
  });
  return `{ ${members.join(' ')} }`;
}

function getEventCollectionType(
  expression: string,
  contextType: string,
): string {
  const path = parseEventCollectionPath(expression);
  return path
    ? `RiotV3PathValue<${contextType}, [${path.map((part) => JSON.stringify(part)).join(', ')}]>`
    : 'any';
}

function parseEventCollectionPath(expression: string): string[] | undefined {
  const trimmed = expression.trim().replace(/^this\./, '');
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(trimmed)) {
    return;
  }
  return trimmed.split('.');
}

function getDynamicObjectPropertyType(
  property: ScriptProperty,
): string | undefined {
  const dynamicPaths = property.inferredAnyAssignmentPaths;
  if (!dynamicPaths?.length) {
    return;
  }
  return applyDynamicObjectPaths(
    property.typeName,
    createPropertyPathTrie(dynamicPaths),
    createPropertyPathTrie(property.explicitTypePaths ?? []),
    false,
  );
}

interface PropertyPathTrie {
  terminal: boolean;
  children: Map<string, PropertyPathTrie>;
}

const emptyPropertyPathTrie: PropertyPathTrie = {
  terminal: false,
  children: new Map(),
};

function createPropertyPathTrie(paths: string[][]): PropertyPathTrie {
  const root: PropertyPathTrie = {
    terminal: false,
    children: new Map(),
  };
  for (const path of paths) {
    let current = root;
    for (const part of path) {
      let child = current.children.get(part);
      if (!child) {
        child = {
          terminal: false,
          children: new Map(),
        };
        current.children.set(part, child);
      }
      current = child;
    }
    current.terminal = true;
  }
  return root;
}

function applyDynamicObjectPaths(
  typeName: string,
  dynamicPaths: PropertyPathTrie,
  explicitPaths: PropertyPathTrie | undefined,
  inheritedDynamic: boolean,
): string {
  if (explicitPaths?.terminal) {
    return typeName;
  }
  const isDynamic = inheritedDynamic || dynamicPaths.terminal;
  if (!isDynamic && !dynamicPaths.children.size) {
    return typeName;
  }
  const members = splitTopLevelUnionTypes(typeName);
  const parsedMembers = members.map((member) => ({
    member,
    arrayElementType: parseArrayType(member),
    properties: parseObjectType(member),
  }));
  const canMakeDynamic =
    isDynamic &&
    parsedMembers.every(
      ({ member, arrayElementType, properties }) =>
        arrayElementType !== undefined ||
        properties !== undefined ||
        isNullishType(member),
    );
  let hasObjectMember = false;
  const transformedMembers = parsedMembers.map(
    ({ member, arrayElementType, properties }) => {
      if (arrayElementType !== undefined) {
        const elementDynamicPaths = getArrayElementPathTrie(dynamicPaths);
        if (
          !isDynamic &&
          !elementDynamicPaths.terminal &&
          !elementDynamicPaths.children.size
        ) {
          return member;
        }
        const transformedElementType = applyDynamicObjectPaths(
          arrayElementType,
          elementDynamicPaths,
          explicitPaths ? getArrayElementPathTrie(explicitPaths) : undefined,
          isDynamic,
        );
        return transformedElementType === arrayElementType
          ? member
          : `(${transformedElementType})[]`;
      }
      if (!properties) {
        return member;
      }
      hasObjectMember = true;
      const objectType = formatObjectType(
        properties.map((property) => {
          const propertyName = normalizeObjectTypePropertyName(property.name);
          return {
            ...property,
            typeName: applyDynamicObjectPaths(
              property.typeName,
              dynamicPaths.children.get(propertyName) ?? emptyPropertyPathTrie,
              explicitPaths?.children.get(propertyName),
              isDynamic,
            ),
          };
        }),
      );
      return canMakeDynamic
        ? `${objectType} & Record<string, any>`
        : objectType;
    },
  );
  if (
    canMakeDynamic &&
    !hasObjectMember &&
    parsedMembers.every(
      ({ arrayElementType }) => arrayElementType === undefined,
    )
  ) {
    transformedMembers.push('Record<string, any>');
  }
  return formatUnionType(transformedMembers);
}

function getArrayElementPathTrie(paths: PropertyPathTrie): PropertyPathTrie {
  const elementPaths: PropertyPathTrie = {
    terminal: false,
    children: new Map(),
  };
  for (const [part, child] of paths.children) {
    if (/^(?:0|[1-9]\d*)$/.test(part)) {
      mergePropertyPathTrie(elementPaths, child);
    }
  }
  return elementPaths;
}

function mergePropertyPathTrie(
  target: PropertyPathTrie,
  source: PropertyPathTrie,
): void {
  target.terminal ||= source.terminal;
  for (const [part, sourceChild] of source.children) {
    let targetChild = target.children.get(part);
    if (!targetChild) {
      targetChild = {
        terminal: false,
        children: new Map(),
      };
      target.children.set(part, targetChild);
    }
    mergePropertyPathTrie(targetChild, sourceChild);
  }
}

function parseArrayType(typeName: string): string | undefined {
  const trimmed = typeName.trim();
  if (!trimmed.endsWith('[]')) {
    return;
  }
  const elementType = trimmed.slice(0, -2).trim();
  if (
    elementType.startsWith('(') &&
    scanBalanced(elementType, 0, '(', ')') === elementType.length
  ) {
    return elementType.slice(1, -1).trim();
  }
  return elementType || undefined;
}

function normalizeObjectTypePropertyName(name: string): string {
  return name[0] === "'" || name[0] === '"' ? name.slice(1, -1) : name;
}

function isNullishType(typeName: string): boolean {
  return typeName === 'null' || typeName === 'undefined';
}

export function getComponentTypeNames(index: number): {
  componentState: string;
  tagInstance: string;
  templateInstance: string;
  templateContext: string;
} {
  return {
    componentState: getComponentStateTypeName(index),
    tagInstance: getComponentTypeName('TagInstance', index),
    templateInstance: getComponentTypeName('TemplateInstance', index),
    templateContext: getComponentTypeName('TemplateContext', index),
  };
}

export function getRiotV3FileTypeScope(fileName: string): string {
  return Array.from(fileName, (character) =>
    character.codePointAt(0)?.toString(16),
  ).join('_');
}

export function getRiotV3ComponentTypesModuleName(
  fileTypeScope?: string,
): string {
  return `riot-v3:${fileTypeScope ?? 'anonymous'}`;
}

export function getRiotV3ComponentTypeReference(
  moduleName: string,
  typeName: string,
): string {
  return `import('${moduleName}').${typeName}`;
}

function getComponentStateTypeName(componentIndex: number): string {
  return getComponentTypeName('ComponentState', componentIndex);
}

function getJSDocTypedefTypeName(
  componentIndex: number,
  typedefName: string,
): string {
  return `${getComponentTypeName('JSDocTypedef', componentIndex)}_${typedefName}`;
}

function resolveJSDocTypedefReferences(
  typeName: string,
  typedefNames: Map<string, string>,
): string {
  return typeName.replace(
    /\b[A-Za-z_$][\w$]*\b/g,
    (identifier) => typedefNames.get(identifier) ?? identifier,
  );
}

function getComponentTypeName(prefix: string, componentIndex: number): string {
  return `${prefix}_${componentIndex}`;
}
