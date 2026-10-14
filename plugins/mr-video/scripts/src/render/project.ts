import {makeProject} from '@revideo/core';
import scene from './scene.tsx';

export default makeProject({
  scenes: [scene],
  variables: {plan: ''},
});
