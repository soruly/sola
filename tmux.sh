tmux new-session -x 250 -y 100 -d
tmux select-layout tiled
tmux send-keys 'npm run watch' Enter
tmux split-window -v
tmux select-layout tiled
tmux send-keys 'npm run load' Enter
for i in {1..14}
do
  tmux split-window -v
  tmux select-layout tiled
  tmux send-keys 'npm run hash' Enter
done
