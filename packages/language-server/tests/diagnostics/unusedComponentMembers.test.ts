import { describe, expect, it } from 'vitest';
import { getUnusedRiotV3ComponentMembers } from '../../src/core/diagnostics';
import { createVirtualCode, offsetOf } from '../helpers/virtualCode';

describe('unused component members', () => {
  it('reports a field that is only assigned', () => {
    // Arrange
    const source = `
<demo-widget>
  <script>
    const self = this
    self.message = null
    self.message = 'Hello'
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused).toEqual([
      {
        name: 'message',
        start: offsetOf(source, 'self.message = null', 'message'),
        end:
          offsetOf(source, 'self.message = null', 'message') + 'message'.length,
      },
    ]);
  });

  it('does not report a field read from script', () => {
    // Arrange
    const source = `
<demo-widget>
  <script>
    this.message = 'Hello'
    console.log(this.message)
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused).toEqual([]);
  });

  it('does not report a field read through a this alias', () => {
    // Arrange
    const source = `
<demo-widget>
  <script>
    const self = this
    self.message = 'Hello'
    console.log(self.message)
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused).toEqual([]);
  });

  it('does not report a field read from a template expression', () => {
    // Arrange
    const source = `
<demo-widget>
  <p>{ message }</p>
  <script>
    this.message = 'Hello'
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused).toEqual([]);
  });

  it.each(['+= 1', '++', '??= 1'])(
    'treats %s as a read-write access',
    (operation) => {
      // Arrange
      const source = `
<demo-widget>
  <script>
    this.count = 0
    this.count ${operation}
  </script>
</demo-widget>
`;
      const analysis = createVirtualCode(source).analysis;

      // Act
      const unused = getUnusedRiotV3ComponentMembers(analysis);

      // Assert
      expect(unused).toEqual([]);
    },
  );

  it('treats an equality comparison as a read', () => {
    // Arrange
    const source = `
<demo-widget>
  <script>
    this.message = 'Hello'
    this.message === 'Hello'
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused).toEqual([]);
  });

  it('reports a field that is only assigned from a callback', () => {
    // Arrange
    const source = `
<demo-widget>
  <script>
    this.message = null
    Promise.resolve().then(() => {
      this.message = 'Hello'
    })
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused.map(({ name }) => name)).toEqual(['message']);
  });

  it('reports an unreferenced Riot method', () => {
    // Arrange
    const source = `
<demo-widget>
  <script>
    handleClick() {}
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused).toEqual([
      {
        name: 'handleClick',
        start: offsetOf(source, 'handleClick()'),
        end: offsetOf(source, 'handleClick()') + 'handleClick'.length,
      },
    ]);
  });

  it('does not report a method referenced as an event handler', () => {
    // Arrange
    const source = `
<demo-widget>
  <button onclick={ handleClick }>Button</button>
  <script>
    handleClick() {}
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused).toEqual([]);
  });

  it.each(['self.handleClick = function () {}', 'self.handleClick = () => {}'])(
    'reports an unreferenced assigned method: %s',
    (assignment) => {
      // Arrange
      const source = `
<demo-widget>
  <script>
    const self = this
    ${assignment}
  </script>
</demo-widget>
`;
      const analysis = createVirtualCode(source).analysis;

      // Act
      const unused = getUnusedRiotV3ComponentMembers(analysis);

      // Assert
      expect(unused.map(({ name }) => name)).toEqual(['handleClick']);
    },
  );

  it('treats self-reference in an assigned arrow function as a read', () => {
    // Arrange
    const source = `
<demo-widget>
  <script>
    const self = this
    self.retry = () => self.retry()
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused).toEqual([]);
  });

  it('treats assignment to a nested property as a read of its root field', () => {
    // Arrange
    const source = `
<demo-widget>
  <script>
    this.state = {}
    this.state.message = 'Hello'
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused).toEqual([]);
  });

  it('reports a method referenced only from its own body', () => {
    // Arrange
    const source = `
<demo-widget>
  <script>
    retry() {
      this.retry()
    }
  </script>
</demo-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused.map(({ name }) => name)).toEqual(['retry']);
  });

  it('analyzes components independently', () => {
    // Arrange
    const source = `
<first-widget>
  <p>{ message }</p>
  <script>this.message = 'Used'</script>
</first-widget>
<second-widget>
  <script>this.message = 'Unused'</script>
</second-widget>
`;
    const analysis = createVirtualCode(source).analysis;

    // Act
    const unused = getUnusedRiotV3ComponentMembers(analysis);

    // Assert
    expect(unused).toEqual([
      {
        name: 'message',
        start: offsetOf(source, "this.message = 'Unused'", 'message'),
        end:
          offsetOf(source, "this.message = 'Unused'", 'message') +
          'message'.length,
      },
    ]);
  });
});
