import {
  createSignal,
  createContext,
  useContext,
  Component,
  ParentComponent,
  onCleanup,
  createMemo,
  Accessor,
} from 'solid-js';

export default function clickOutside(el: Element, accessor: Accessor<() => void>) {
  const onClick = (e: MouseEvent) => !el.contains(e.target as Node) && accessor()?.();
  document.body.addEventListener('click', onClick);

  onCleanup(() => document.body.removeEventListener('click', onClick));
}

const makeContext = () => {
  const [open, setOpen] = createSignal<string | null>(null);
  return { open, setOpen } as const;
};

const MenuContext = createContext<ReturnType<typeof makeContext>>();

const useMenu = () => {
  return useContext(MenuContext);
};

export const MenuBar: ParentComponent = (props) => {
  const ctx = makeContext();

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key.toLocaleLowerCase() === 'escape') {
      ctx.setOpen(null);
    }
  };

  window.addEventListener('keydown', handleKeydown);
  onCleanup(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  return (
    <MenuContext.Provider value={ctx}>
      <div class="flex items-start bg-zinc-800">
        {/* @ts-ignore -- why doesn't TS like Solid's use: ? */}
        <div use:clickOutside={() => ctx.setOpen(null)} class="flex  p-1">
          {props.children}
        </div>
      </div>
    </MenuContext.Provider>
  );
};

export const Menu: ParentComponent<{
  name: string;
}> = (props) => {
  const ctx = useMenu();

  const isOpen = createMemo(() => ctx?.open() === props.name);

  return (
    <div class="relative">
      <button
        class="rounded px-2 py-0.5 text-sm text-white hover:bg-zinc-600"
        classList={{
          'bg-zinc-600': isOpen(),
        }}
        onClick={() => ctx?.setOpen((v) => (v === props.name ? null : props.name))}
        onMouseOver={() => {
          ctx?.setOpen((v) => (v && props.name) || null);
        }}
      >
        {props.name}
      </button>
      {isOpen() && (
        <div class="absolute z-10 flex flex-col rounded bg-zinc-800 px-1 py-2 shadow-md">
          {props.children}
        </div>
      )}
    </div>
  );
};

interface MenuItemProps {
  name: string;
  keybind?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export const MenuItem: Component<MenuItemProps> = (props) => {
  const ctx = useMenu();

  return (
    <button
      class="flex items-center whitespace-nowrap rounded px-2 py-1 text-left text-sm"
      classList={{
        'text-white hover:bg-zinc-600 focus:bg-zinc-600': !props.disabled,
        'text-zinc-400': props.disabled,
      }}
      onClick={() => {
        ctx?.setOpen(null);
        props.onClick && props.onClick();
      }}
      disabled={props.disabled}
    >
      <span class="mr-6 flex-1">{props.name}</span>
      {props.keybind && <span class="text-xs opacity-50">{props.keybind}</span>}
    </button>
  );
};

export const MenuItemSpacer: Component = () => {
  return <hr class="mx-2 my-1 border-zinc-500" />;
};
