import type { GeneratedSegment, ScriptProperty } from './types';

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
  eachDepthCount: number;
}

export interface GeneratedRiotV3GlobalTypes {
  text: string;
  segments: GeneratedSegment[];
}

export function generateRiotV3GlobalTypes(
  components: RiotV3GlobalTypesComponentData[],
  fileTypeScope?: string,
): GeneratedRiotV3GlobalTypes {
  const dynamicTypeSegments: GeneratedSegment[] = [];
  for (let index = 0; index < components.length; index++) {
    const { scriptProperties, eachDepthCount } = components[index];
    dynamicTypeSegments.push({
      text: `\ninterface ${getComponentStateTypeName(index, fileTypeScope)} {\n`,
    });
    for (const property of scriptProperties) {
      dynamicTypeSegments.push({ text: '\t' });
      dynamicTypeSegments.push({
        text: property.name,
        sourceOffset: property.sourceOffset,
        length: property.name.length,
      });
      dynamicTypeSegments.push({ text: ': ' + property.typeName + ';\n' });
    }
    dynamicTypeSegments.push({ text: '}\n' });

    const typeNames = getComponentTypeNames(index, fileTypeScope);
    dynamicTypeSegments.push({
      text: `\ninterface ${typeNames.tagInstance} extends RiotV3TagInstance, ${getComponentStateTypeName(index, fileTypeScope)} {}\n`,
    });
    dynamicTypeSegments.push({
      text: `\ninterface ${typeNames.templateInstance} extends RiotV3TemplateInstance, ${getComponentStateTypeName(index, fileTypeScope)} {}\n`,
    });
    for (let depth = 0; depth < Math.max(1, eachDepthCount); depth++) {
      const eachContextName = getEachContextTypeName(
        index,
        depth,
        fileTypeScope,
      );
      const parentTypeName =
        depth === 0
          ? typeNames.templateInstance
          : getEachContextTypeName(index, depth - 1, fileTypeScope);
      dynamicTypeSegments.push({
        text: `\ninterface ${eachContextName} extends RiotV3EachContext, ${typeNames.templateInstance} {\n\tparent: ${parentTypeName};\n}\n`,
      });
    }
  }

  return {
    text: riotV3GlobalTypes,
    segments: dynamicTypeSegments,
  };
}

export function getComponentTypeNames(
  index: number,
  fileTypeScope?: string,
): {
  tagInstance: string;
  templateInstance: string;
  eachContext: string;
} {
  return {
    tagInstance: getComponentTypeName(
      'RiotV3TagInstance',
      index,
      fileTypeScope,
    ),
    templateInstance: getComponentTypeName(
      'RiotV3TemplateInstance',
      index,
      fileTypeScope,
    ),
    eachContext: getEachContextTypeName(index, 0, fileTypeScope),
  };
}

export function getEachContextTypeName(
  componentIndex: number,
  depth: number,
  fileTypeScope?: string,
): string {
  const componentScope = getComponentTypeScope(componentIndex, fileTypeScope);
  return depth === 0
    ? `RiotV3EachContext_${componentScope}`
    : `RiotV3EachContext_${componentScope}_${depth}`;
}

export function getRiotV3FileTypeScope(fileName: string): string {
  return Array.from(fileName, (character) =>
    character.codePointAt(0)?.toString(16),
  ).join('_');
}

function getComponentStateTypeName(
  componentIndex: number,
  fileTypeScope?: string,
): string {
  return getComponentTypeName(
    'RiotV3ComponentState',
    componentIndex,
    fileTypeScope,
  );
}

function getComponentTypeName(
  prefix: string,
  componentIndex: number,
  fileTypeScope?: string,
): string {
  return `${prefix}_${getComponentTypeScope(componentIndex, fileTypeScope)}`;
}

function getComponentTypeScope(
  componentIndex: number,
  fileTypeScope?: string,
): string {
  return fileTypeScope
    ? `${fileTypeScope}_${componentIndex}`
    : `${componentIndex}`;
}
