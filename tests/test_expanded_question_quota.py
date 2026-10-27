import pytest
from scripts.expanded_question_quota import typed_decisions

def choice():return {'type':'choice','criteria':{'safe':'safe','unsafe':'unsafe','privacy':'private'}}
def test_multiple_questions_are_not_one_request_one_decision():
    assert typed_decisions({'questions':{'a':choice(),'b':choice()}})==2
def test_explicit_permutations_multiply_each_question():
    assert typed_decisions({'questions':{'a':choice(),'b':choice()},'permutations':3,'order_invariant':True})==6
@pytest.mark.parametrize('body',[{}, {'questions':{}}, {'questions':{'a':choice()},'order_invariant':True},
 {'questions':{'a':{'type':'choice','criteria':{str(i):'x' for i in range(11)}}}},
 {'questions':{'a':{'type':'other'}}}, {'questions':{'a':choice()},'permutations':True}])
def test_unknown_or_automatic_decision_cost_is_blocked(body):
    with pytest.raises(ValueError):typed_decisions(body)
