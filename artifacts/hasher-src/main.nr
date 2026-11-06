use poseidon::poseidon2::Poseidon2;

fn main(val: Field, salt: Field) {
    let h = Poseidon2::hash([val, salt], 2);
    std::println(h);
}
