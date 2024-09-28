import clsx from 'clsx';
import {
  Accessor,
  Component,
  ParentComponent,
  Show,
  createContext,
  createSignal,
  useContext,
} from 'solid-js';
import { Dynamic, Portal } from 'solid-js/web';

export const ModalTitle: ParentComponent = (props) => {
  const modal = useModal();

  return (
    <div class="mb-6 flex flex-row">
      <h1 class="flex-1 text-lg font-bold">{props.children}</h1>
      <button
        onClick={() => modal?.hide()}
        class={clsx(
          'h-6 w-6 rounded-full',
          'from-indigo-600 via-purple-600 to-pink-600 hover:bg-gradient-to-r',
        )}
      >
        &#x2715;
      </button>
    </div>
  );
};

export const Modal: ParentComponent<{
  show?: boolean;
  onClose?: () => void;
}> = (props) => {
  return (
    <Show when={props.show}>
      <Portal mount={document.body}>
        <div class="absolute inset-0 z-30">
          <div class="absolute inset-0 bg-black/50" onClick={() => props.onClose?.()} />
          <div class="mx-auto mt-[25vh] max-w-2xl rounded-lg bg-zinc-900 px-6 py-3 drop-shadow-lg">
            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
};

type ModalController = {
  visible: Accessor<boolean>;
  show: () => void;
  hide: () => void;
};

const ModalContext = createContext<ModalController>();

// const ModalContextProvider: ParentComponent = props => {
//   const [visible, setVisibile] = createSignal(false);

//   const modal: ModalController = {
//     visible,
//   };

//   return (
//     <ModalContext.Provider value={modal}>
//       {props.children}
//     </ModalContext.Provider>
//   );
// };

export const useModal = () => useContext(ModalContext);

export const createModal = (): [ParentComponent, ModalController] => {
  const [open, setOpen] = createSignal(false);

  const [visible, setVisibile] = createSignal(false);

  const controller: ModalController = {
    visible,
    show: () => setVisibile(true),
    hide: () => setVisibile(false),
  };

  const node: ParentComponent = (props) => {
    return (
      <ModalContext.Provider value={controller}>
        <Modal show={visible()} onClose={() => controller.hide()}>
          {props.children}
        </Modal>
      </ModalContext.Provider>
    );
  };

  return [node, controller];
};
