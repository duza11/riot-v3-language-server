import type { RiotV3LanguageOptions } from './options';
import { scanBalanced } from './scanners';
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
    const { scriptProperties, jsDocTypedefs } = components[index];
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
            getGeneratedPropertyTypeName(property, options),
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
): string {
  if (
    options.allowDynamicObjectProperties &&
    property.typeOrigin === 'inferred' &&
    property.hasInferredAnyAssignment
  ) {
    return getDynamicObjectPropertyType(property) ?? property.typeName;
  }
  return property.typeName;
}

function getDynamicObjectPropertyType(
  property: ScriptProperty,
): string | undefined {
  const members = property.unionTypeNames ?? [property.typeName];
  if (
    !members.every(
      (typeName) => isObjectLiteralType(typeName) || isNullishType(typeName),
    )
  ) {
    return;
  }
  const dynamicMembers = members.map((typeName) =>
    isObjectLiteralType(typeName)
      ? `${typeName} & Record<string, any>`
      : typeName,
  );
  if (!members.some(isObjectLiteralType)) {
    dynamicMembers.push('Record<string, any>');
  }
  return dynamicMembers.join(' | ');
}

function isObjectLiteralType(typeName: string): boolean {
  const trimmed = typeName.trim();
  return (
    trimmed.startsWith('{') &&
    scanBalanced(trimmed, 0, '{', '}') === trimmed.length
  );
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
