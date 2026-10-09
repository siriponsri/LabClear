"""Execute the demonstration notebook in-process, without a Jupyter TCP kernel.
Use this in restricted build environments; normal Jupyter execution also works.
Requires the optional requirements-eval.txt dependencies.
"""
import argparse,os
from pathlib import Path
import nbformat
from IPython.core.interactiveshell import InteractiveShell
from IPython.utils.capture import capture_output

p=argparse.ArgumentParser();p.add_argument('notebook',type=Path);a=p.parse_args()
path=a.notebook.resolve();os.chdir(path.parent.parent)
book=nbformat.read(path,as_version=4);shell=InteractiveShell.instance();count=0
for cell in book.cells:
    if cell.cell_type!='code':continue
    count+=1
    with capture_output() as captured:
        result=shell.run_cell(cell.source,store_history=False)
    if result.error_before_exec or result.error_in_exec:
        raise RuntimeError(f'Cell {count}: {result.error_before_exec or result.error_in_exec}')
    cell.execution_count=count;cell.outputs=[]
    if captured.stdout:cell.outputs.append(nbformat.v4.new_output('stream',name='stdout',text=captured.stdout))
    if captured.stderr:cell.outputs.append(nbformat.v4.new_output('stream',name='stderr',text=captured.stderr))
    for output in captured.outputs:cell.outputs.append(nbformat.v4.new_output('display_data',data=output.data,metadata=output.metadata))
nbformat.write(book,path);print(f'Executed {count} cells without errors: {path.name}')
