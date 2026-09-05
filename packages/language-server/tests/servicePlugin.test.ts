import { CancellationToken } from '@volar/language-server/node';
import { describe, expect, it } from 'vitest';
import type { NavigationOccurrence } from '../src/core/navigation/types';
import {
  createRiotV3ServicePlugin,
  createUnusedComponentMemberDiagnostics,
  filterReferenceOccurrences,
} from '../src/server/servicePlugin';
import { createServicePluginFixture } from './helpers/servicePlugin';

const occurrences: NavigationOccurrence[] = [
  { start: 10, end: 17, role: 'read' },
  { start: 20, end: 27, role: 'declaration' },
  { start: 30, end: 37, role: 'write', isDefinition: true },
];

describe('reference occurrence filtering', () => {
  it('excludes declarations by role instead of array position', () => {
    // Arrange
    const includeDeclaration = false;

    // Act
    const filtered = filterReferenceOccurrences(
      occurrences,
      includeDeclaration,
    );

    // Assert
    expect(filtered.map(({ role }) => role)).toEqual(['read', 'write']);
  });

  it('keeps every occurrence when declarations are requested', () => {
    // Arrange
    const includeDeclaration = true;

    // Act
    const filtered = filterReferenceOccurrences(
      occurrences,
      includeDeclaration,
    );

    // Assert
    expect(filtered).toEqual(occurrences);
  });

  it('keeps inferred definitions when declarations are excluded', () => {
    // Arrange
    const includeDeclaration = false;

    // Act
    const filtered = filterReferenceOccurrences(
      occurrences,
      includeDeclaration,
    );

    // Assert
    expect(filtered).toContainEqual({
      start: 30,
      end: 37,
      role: 'write',
      isDefinition: true,
    });
  });
});

describe('unused component member diagnostics', () => {
  it('creates a TypeScript-compatible hint at the member declaration', () => {
    // Arrange
    const members = [{ name: 'message', start: 10, end: 17 }];
    const positionAt = (offset: number) => ({ line: 0, character: offset });

    // Act
    const diagnostics = createUnusedComponentMemberDiagnostics(
      members,
      positionAt,
    );

    // Assert
    expect(diagnostics).toEqual([
      {
        severity: 4,
        range: {
          start: { line: 0, character: 10 },
          end: { line: 0, character: 17 },
        },
        code: 6133,
        source: 'riot_v3',
        tags: [1],
        message: "'message' is declared but its value is never read.",
      },
    ]);
  });

  it('does not provide source diagnostics from a child virtual document', async () => {
    // Arrange
    const source = `<root><script>unused() {}</script><script>const b = 1</script></root>`;
    const fixture = createServicePluginFixture(source);
    const service = createRiotV3ServicePlugin().create(fixture.context);

    // Act
    const diagnostics = await service.provideDiagnostics?.(
      fixture.getDocument('script_0'),
      CancellationToken.None,
    );

    // Assert
    expect(diagnostics).toBeUndefined();
  });

  it('provides an unused member diagnostic from the root virtual document', async () => {
    // Arrange
    const source = `<root><script>unused() {}</script><script>const b = 1</script></root>`;
    const fixture = createServicePluginFixture(source);
    const service = createRiotV3ServicePlugin().create(fixture.context);
    const document = fixture.getDocument('root');
    const start = source.indexOf('unused');

    // Act
    const diagnostics = await service.provideDiagnostics?.(
      document,
      CancellationToken.None,
    );

    // Assert
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics?.[0].range).toEqual({
      start: document.positionAt(start),
      end: document.positionAt(start + 'unused'.length),
    });
  });

  it('provides a duplicate style diagnostic from the root virtual document', async () => {
    // Arrange
    const source = `<root><style>a {}</style><style>b {}</style></root>`;
    const fixture = createServicePluginFixture(source);
    const service = createRiotV3ServicePlugin().create(fixture.context);
    const document = fixture.getDocument('root');
    const start = source.indexOf('<style>', source.indexOf('<style>') + 1);
    const end = source.indexOf('</style>', start) + '</style>'.length;

    // Act
    const diagnostics = await service.provideDiagnostics?.(
      document,
      CancellationToken.None,
    );

    // Assert
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics?.[0].range).toEqual({
      start: document.positionAt(start),
      end: document.positionAt(end),
    });
  });
});

describe('document-local navigation', () => {
  const source = `<root><p>{ message }</p><script>this.message = 'Hi'</script></root>`;

  it('does not provide highlights from a child virtual document', async () => {
    // Arrange
    const fixture = createServicePluginFixture(source);
    const service = createRiotV3ServicePlugin().create(fixture.context);
    const document = fixture.getDocument('script_0');
    const position = document.positionAt(document.getText().indexOf('message'));

    // Act
    const highlights = await service.provideDocumentHighlights?.(
      document,
      position,
      CancellationToken.None,
    );

    // Assert
    expect(highlights).toBeUndefined();
  });

  it('provides highlights from the root virtual document', async () => {
    // Arrange
    const fixture = createServicePluginFixture(source);
    const service = createRiotV3ServicePlugin().create(fixture.context);
    const document = fixture.getDocument('root');
    const templateStart = source.indexOf('message');
    const scriptStart = source.lastIndexOf('message');

    // Act
    const highlights = await service.provideDocumentHighlights?.(
      document,
      document.positionAt(templateStart),
      CancellationToken.None,
    );

    // Assert
    expect(highlights?.map(({ range }) => range)).toEqual([
      {
        start: document.positionAt(scriptStart),
        end: document.positionAt(scriptStart + 'message'.length),
      },
      {
        start: document.positionAt(templateStart),
        end: document.positionAt(templateStart + 'message'.length),
      },
    ]);
  });

  it('does not provide a rename range from a child virtual document', async () => {
    // Arrange
    const fixture = createServicePluginFixture(source);
    const service = createRiotV3ServicePlugin().create(fixture.context);
    const document = fixture.getDocument('script_0');
    const position = document.positionAt(document.getText().indexOf('message'));

    // Act
    const range = await service.provideRenameRange?.(
      document,
      position,
      CancellationToken.None,
    );

    // Assert
    expect(range).toBeUndefined();
  });

  it('provides a rename range from the root virtual document', async () => {
    // Arrange
    const fixture = createServicePluginFixture(source);
    const service = createRiotV3ServicePlugin().create(fixture.context);
    const document = fixture.getDocument('root');
    const start = source.indexOf('message');

    // Act
    const range = await service.provideRenameRange?.(
      document,
      document.positionAt(start),
      CancellationToken.None,
    );

    // Assert
    expect(range).toEqual({
      start: document.positionAt(start),
      end: document.positionAt(start + 'message'.length),
    });
  });
});
