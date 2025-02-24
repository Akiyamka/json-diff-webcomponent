import { registerComponent } from './';

const getComponentInstance = registerComponent();
const diffInstance = getComponentInstance('diff');
if (diffInstance) {
  diffInstance.left = JSON.stringify({
    'Aidan Gillen': {
      aboolean: true,
      array: ['Game of Thron"es', 'The Wire'],
      boolean: true,
      int: 2,
      object: {
        foo: 'bar',
        object1: {
          'new prop1': 'new prop value',
        },
        object2: {
          'new prop1': 'new prop value',
        },
        object3: {
          'new prop1': 'new prop value',
        },
        object4: {
          'new prop1': 'new prop value',
        },
      },
      string: 'some string',
    },
    'Alexander Skarsgard': ['Generation Kill', 'True Blood'],
    'Amy Ryan': {
      one: 'In Treatment',
      two: 'The Wire',
    },
    'Annie Fitzgerald': ['Big Love', 'True Blood'],
    'Anwan Glover': ['Treme', 'The Wire'],
    'Clarke Peters': null,
  });

  diffInstance.right = JSON.stringify({
    'Aidan Gillen': {
      aboolean: 'true',
      array: ['Game of Thrones', 'The Wire'],
      boolean: false,
      int: '2',
      object: {
        foo: 'bar',
      },
      otherint: 4,
      string: 'some string',
    },
    'Alexander Skarsg?rd': ['Generation Kill', 'True Blood'],
    'Alice Farmer': ['The Corner', 'Oz', 'The Wire'],
    'Amy Ryan': ['In Treatment', 'The Wire'],
    'Annie Fitzgerald': ['True Blood', 'Big Love', 'The Sopranos', 'Oz'],
    'Anwan Glover': ['Treme', 'The Wire'],
  });
}
