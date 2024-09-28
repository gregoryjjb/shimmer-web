import clsx from 'clsx';
import { ComponentProps, ValidComponent, splitProps, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';

export type GradientButtonProps<T extends ValidComponent> = {
  component: T;
  baseColor: string;
  hoverColor: string;
} & ComponentProps<T>;

const GradientButton = <T extends ValidComponent>(props: GradientButtonProps<T>): JSX.Element => {
  const [, passthroughProps] = splitProps(props, ['class', 'baseColor', 'hoverColor', 'component']);

  return (
    <Dynamic
      component={props.component}
      class={clsx(
        props.class,
        'relative z-0 overflow-hidden',
        // 'px-16 py-4 text-3xl', // Size classes
        'bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-500',
        'before:absolute before:inset-0 before:-z-10 before:opacity-0 before:transition-opacity',
        'before:bg-gradient-to-r before:from-sky-400 before:via-fuchsia-400 before:to-orange-400',
        'hocus:before:opacity-100',
      )}
      {...passthroughProps}
    />
  );
};

export default GradientButton;
