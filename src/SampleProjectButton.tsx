import { Component } from 'solid-js';
import GradientButton from './components/GradientButton';
import { useTimeline } from './TimelineContext';
import clsx from 'clsx';
import { projectFromURL } from './timeline/export';

export const SampleProjectButton: Component<{ class?: string }> = (props) => {
  const ctx = useTimeline();

  return (
    <GradientButton
      component="button"
      class={clsx(
        'rounded px-1 py-0.5 text-sm font-semibold text-black',
        props.class,
      )}
      onClick={async () => {
        const project = await projectFromURL('/Carol of the Bells.zip');
        ctx.timeline.load(project);
        ctx.setProjectName(project.name);
      }}
    >
      ✨ Open sample project
    </GradientButton>
  );
};
