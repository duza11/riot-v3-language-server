import { describe, expect, it } from 'vitest';
import {
  getRiotV3ReferenceOccurrences,
  getRiotV3ReferenceRanges,
  getRiotV3RenameEdits,
  getRiotV3RenameRange,
} from '../../src/languagePlugin';
import {
  expectAllNewText,
  lastOffsetOf,
  offsetOf,
  startsOf,
  textAtRanges,
} from '../helpers/virtualCode';

describe('each local navigation', () => {
  it('classifies each local definitions separately from reads', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p each={ item in items }>{ item.name }</p>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ item.name }', 'item');

    // Act
    const occurrences = getRiotV3ReferenceOccurrences(source, position);

    // Assert
    expect(occurrences.map(({ role }) => role)).toEqual([
      'declaration',
      'read',
    ]);
  });

  it('renames Riot v3 each local variables from their definition', () => {
    const source = `
  <demo-widget>
    <ul>
      <li each={ item, i in items }>{ i }: { item.name }</li>
    </ul>
  </demo-widget>
  `;
    const position = offsetOf(source, 'item, i in items', 'item');

    const edits = getRiotV3RenameEdits(source, position, 'entry');

    expect(textAtRanges(source, edits)).toEqual(['item', 'item']);
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item, i in items', 'item'),
      offsetOf(source, '{ item.name }', 'item'),
    ]);
    expectAllNewText(edits, 'entry');
  });

  it('renames Riot v3 each local variables from their reference', () => {
    const source = `
  <demo-widget>
    <ul>
      <li each={ item, i in items }>{ i }: { item.name }</li>
    </ul>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ item.name }', 'item');

    const edits = getRiotV3RenameEdits(source, position, 'entry');

    expect(textAtRanges(source, edits)).toEqual(['item', 'item']);
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item, i in items', 'item'),
      offsetOf(source, '{ item.name }', 'item'),
    ]);
  });

  it('renames explicit each locals referenced through this', () => {
    // Arrange
    const source = `
  <demo-widget>
    <ul>
      <li each={ item, i in items }>{ item.name } { this.item.name }</li>
    </ul>
  </demo-widget>
  `;
    const position = offsetOf(source, 'item, i in items', 'item');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'entry');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item, i in items', 'item'),
      offsetOf(source, '{ item.name }', 'item'),
      offsetOf(source, '{ this.item.name }', 'item'),
    ]);
    expectAllNewText(edits, 'entry');
  });

  it('renames explicit each locals from this references', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p each={ item in items }>{ item.name } { this.item.name }</p>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ this.item.name }', 'item');

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'entry');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item in items', 'item'),
      offsetOf(source, '{ item.name }', 'item'),
      offsetOf(source, '{ this.item.name }', 'item'),
    ]);
  });

  it('renames explicit each indexes through bare and this references', () => {
    // Arrange
    const source = `
  <demo-widget>
    <p each={ item, i in items }>{ i } { this.i }</p>
  </demo-widget>
  `;
    const thisIndexOffset =
      offsetOf(source, '{ this.i }', 'this.i') + 'this.'.length;
    const position = thisIndexOffset;

    // Act
    const edits = getRiotV3RenameEdits(source, position, 'index');

    // Assert
    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item, i in items', 'i in'),
      offsetOf(source, '{ i }', 'i'),
      thisIndexOffset,
    ]);
  });

  it('keeps outer shadowed Riot v3 each locals separate during rename', () => {
    const source = `
  <demo-widget>
    <ul>
      <li each={ item in items }>
        <span>{ item.name }</span>
        <em each={ item in item.children }>{ item.name }</em>
        <strong>{ item.label }</strong>
      </li>
    </ul>
  </demo-widget>
  `;
    const position = offsetOf(source, 'item in items', 'item');

    const edits = getRiotV3RenameEdits(source, position, 'group');

    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item in items', 'item'),
      offsetOf(source, '{ item.name }', 'item'),
      offsetOf(source, 'item.children', 'item'),
      offsetOf(source, '{ item.label }', 'item'),
    ]);
    expect(textAtRanges(source, edits)).toEqual([
      'item',
      'item',
      'item',
      'item',
    ]);
  });

  it('keeps inner shadowed Riot v3 each locals separate during rename', () => {
    const source = `
  <demo-widget>
    <ul>
      <li each={ item in items }>
        <span>{ item.name }</span>
        <em each={ item in item.children }>{ item.name }</em>
        <strong>{ item.label }</strong>
      </li>
    </ul>
  </demo-widget>
  `;
    const position = offsetOf(source, 'item in item.children', 'item');

    const edits = getRiotV3RenameEdits(source, position, 'child');

    expect(startsOf(edits)).toEqual([
      offsetOf(source, 'item in item.children', 'item'),
      lastOffsetOf(source, '{ item.name }', 'item'),
    ]);
    expect(textAtRanges(source, edits)).toEqual(['item', 'item']);
  });

  it('keeps outer shadowed Riot v3 each locals separate in references', () => {
    const source = `
  <demo-widget>
    <ul>
      <li each={ item in items }>
        <span>{ item.name }</span>
        <em each={ item in item.children }>{ item.name }</em>
        <strong>{ item.label }</strong>
      </li>
    </ul>
  </demo-widget>
  `;
    const position = offsetOf(source, '{ item.name }', 'item');

    const references = getRiotV3ReferenceRanges(source, position);

    expect(startsOf(references)).toEqual([
      offsetOf(source, 'item in items', 'item'),
      offsetOf(source, '{ item.name }', 'item'),
      offsetOf(source, 'item.children', 'item'),
      offsetOf(source, '{ item.label }', 'item'),
    ]);
  });

  it('keeps inner shadowed Riot v3 each locals separate in references', () => {
    const source = `
  <demo-widget>
    <ul>
      <li each={ item in items }>
        <span>{ item.name }</span>
        <em each={ item in item.children }>{ item.name }</em>
        <strong>{ item.label }</strong>
      </li>
    </ul>
  </demo-widget>
  `;
    const position = lastOffsetOf(source, '{ item.name }', 'item');

    const references = getRiotV3ReferenceRanges(source, position);

    expect(startsOf(references)).toEqual([
      offsetOf(source, 'item in item.children', 'item'),
      lastOffsetOf(source, '{ item.name }', 'item'),
    ]);
  });

  it('returns the rename range for Riot v3 each local definitions', () => {
    const source = `
  <demo-widget>
    <ul>
      <li each={ item, i in items }>{ i }: { item.name }</li>
    </ul>
  </demo-widget>
  `;
    const position = offsetOf(source, 'item, i in items', 'item');

    const range = getRiotV3RenameRange(source, position);

    expect(range).toEqual({
      start: position,
      end: position + 'item'.length,
    });
  });
});
